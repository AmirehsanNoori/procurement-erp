import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/ticketing behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });
const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;

/** Resolve a set of user ids to {id: fullName}. */
async function userNames(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (uniq.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, fullName: true } });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

/** Agents = users who belong to this tenant (for assignment). */
router.get('/agents', requirePermission('ticketing.view'), asyncHandler(async (req, res) => {
  const links = await prisma.tenantUser.findMany({ where: { tenantId: tid(req) }, select: { user: { select: { id: true, fullName: true } } } });
  const agents = links.map((l) => l.user).filter(Boolean).sort((a, b) => a.fullName.localeCompare(b.fullName));
  res.json({ agents });
}));

router.get('/overview', requirePermission('ticketing.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const [open, inProgress, resolved, closed, urgent] = await Promise.all([
    prisma.ticket.count({ where: { tenantId, status: 'open' } }),
    prisma.ticket.count({ where: { tenantId, status: 'in_progress' } }),
    prisma.ticket.count({ where: { tenantId, status: 'resolved' } }),
    prisma.ticket.count({ where: { tenantId, status: 'closed' } }),
    prisma.ticket.count({ where: { tenantId, priority: 'urgent', status: { in: ['open', 'in_progress'] } } }),
  ]);
  res.json({ open, inProgress, resolved, closed, urgent });
}));

router.get('/', requirePermission('ticketing.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const terms = searchTerms(req.query.search as string | undefined);
  const where: Prisma.TicketWhereInput = {
    tenantId,
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(req.query.priority ? { priority: req.query.priority as string } : {}),
    ...(req.query.category ? { category: req.query.category as string } : {}),
    ...(req.query.mine === '1' ? { assigneeId: req.auth!.userId } : {}),
    ...(terms.length ? { OR: terms.map((v) => ({ subject: { contains: v, mode: 'insensitive' as const } })) } : {}),
  };
  const tickets = await prisma.ticket.findMany({ where, orderBy: { number: 'desc' }, take: 300 });
  const names = await userNames(tickets.flatMap((t) => [t.requesterId, t.assigneeId]));
  res.json({ tickets: tickets.map((t) => ({ ...t, requesterName: t.requesterId ? names.get(t.requesterId) ?? null : null, assigneeName: t.assigneeId ? names.get(t.assigneeId) ?? null : null })) });
}));

router.get('/:id', requirePermission('ticketing.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const ticket = await prisma.ticket.findFirst({ where: { tenantId, id: req.params.id }, include: { comments: { orderBy: { createdAt: 'asc' } } } });
  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');
  const names = await userNames([ticket.requesterId, ticket.assigneeId, ...ticket.comments.map((c) => c.authorId)]);
  res.json({ ticket: {
    ...ticket,
    requesterName: ticket.requesterId ? names.get(ticket.requesterId) ?? null : null,
    assigneeName: ticket.assigneeId ? names.get(ticket.assigneeId) ?? null : null,
    comments: ticket.comments.map((c) => ({ ...c, authorName: c.authorId ? names.get(c.authorId) ?? null : null })),
  } });
}));

const createSchema = z.object({
  subject: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.enum(['it', 'hr', 'facilities', 'finance', 'other']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

router.post('/', requirePermission('ticketing.create'), validate(createSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const b = req.body as z.infer<typeof createSchema>;
  const last = await prisma.ticket.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  const ticket = await prisma.ticket.create({
    data: { tenantId, number: (last?.number ?? 0) + 1, subject: b.subject.trim(), description: b.description ?? null, category: b.category ?? 'it', priority: b.priority ?? 'medium', assigneeId: b.assigneeId ?? null, dueDate: b.dueDate ?? null, requesterId: req.auth!.userId },
  });
  res.status(201).json({ ticket });
}));

const updateSchema = z.object({
  subject: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  category: z.enum(['it', 'hr', 'facilities', 'finance', 'other']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'cancelled']).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

router.patch('/:id', requirePermission('ticketing.edit'), validate(updateSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.ticket.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('تیکت یافت نشد');
  const b = req.body as z.infer<typeof updateSchema>;
  const resolving = b.status === 'resolved' && existing.status !== 'resolved';
  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data: {
      ...(b.subject !== undefined ? { subject: b.subject.trim() } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.category !== undefined ? { category: b.category } : {}),
      ...(b.priority !== undefined ? { priority: b.priority } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.assigneeId !== undefined ? { assigneeId: b.assigneeId } : {}),
      ...(b.dueDate !== undefined ? { dueDate: b.dueDate } : {}),
      ...(resolving ? { resolvedAt: new Date() } : {}),
    },
  });
  res.json({ ticket });
}));

router.post('/:id/comments', requirePermission('ticketing.view'), validate(z.object({ body: z.string().min(1) })), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const ticket = await prisma.ticket.findFirst({ where: { tenantId, id: req.params.id } });
  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');
  const comment = await prisma.ticketComment.create({ data: { tenantId, ticketId: ticket.id, authorId: req.auth!.userId, body: (req.body as { body: string }).body.trim() } });
  res.status(201).json({ comment });
}));

router.delete('/:id', requirePermission('ticketing.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.ticket.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('تیکت یافت نشد');
  await prisma.ticket.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
