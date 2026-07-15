import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/office behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });
const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;

// ── Letters / secretariat (دبیرخانه) ─────────────────────────────────────────
const letterSchema = z.object({
  letterNumber: z.string().min(1),
  direction: z.enum(['incoming', 'outgoing', 'internal']).optional(),
  subject: z.string().min(1),
  correspondent: z.string().optional().nullable(),
  letterDate: z.coerce.date().optional().nullable(),
  priority: z.enum(['normal', 'important', 'urgent']).optional(),
  status: z.enum(['draft', 'registered', 'sent', 'archived']).optional(),
  referenceNumber: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
});

router.get('/letters', requirePermission('office.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const terms = searchTerms(req.query.search as string | undefined);
  const where: Prisma.OfficeLetterWhereInput = {
    tenantId,
    ...(req.query.direction ? { direction: req.query.direction as string } : {}),
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(terms.length ? { OR: terms.flatMap((v) => [
      { letterNumber: { contains: v, mode: 'insensitive' as const } },
      { subject: { contains: v, mode: 'insensitive' as const } },
      { correspondent: { contains: v, mode: 'insensitive' as const } },
    ]) } : {}),
  };
  const letters = await prisma.officeLetter.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ letters });
}));

router.post('/letters', requirePermission('office.create'), validate(letterSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req); const b = req.body as z.infer<typeof letterSchema>;
  const dup = await prisma.officeLetter.findFirst({ where: { tenantId, letterNumber: b.letterNumber.trim() } });
  if (dup) throw ApiError.conflict(`نامه با شماره «${b.letterNumber.trim()}» قبلاً ثبت شده است`);
  const letter = await prisma.officeLetter.create({ data: { tenantId, ...b, letterNumber: b.letterNumber.trim(), subject: b.subject.trim(), createdById: req.auth!.userId } });
  res.status(201).json({ letter });
}));

router.patch('/letters/:id', requirePermission('office.edit'), validate(letterSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeLetter.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('نامه یافت نشد');
  const { letterNumber, ...rest } = req.body as Partial<z.infer<typeof letterSchema>>;
  const letter = await prisma.officeLetter.update({ where: { id: existing.id }, data: rest });
  res.json({ letter });
}));

router.delete('/letters/:id', requirePermission('office.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeLetter.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('نامه یافت نشد');
  await prisma.officeLetter.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Meetings (جلسات) ─────────────────────────────────────────────────────────
const meetingSchema = z.object({
  title: z.string().min(1),
  date: z.coerce.date().optional().nullable(),
  location: z.string().optional().nullable(),
  organizer: z.string().optional().nullable(),
  attendees: z.string().optional().nullable(),
  agenda: z.string().optional().nullable(),
  minutes: z.string().optional().nullable(),
  status: z.enum(['scheduled', 'held', 'cancelled']).optional(),
});
const meetingInclude = { actions: { orderBy: { createdAt: 'asc' as const } } };

router.get('/meetings', requirePermission('office.view'), asyncHandler(async (req, res) => {
  const meetings = await prisma.officeMeeting.findMany({ where: { tenantId: tid(req), ...(req.query.status ? { status: req.query.status as string } : {}) }, include: { _count: { select: { actions: true } } }, orderBy: { date: 'desc' }, take: 300 });
  res.json({ meetings });
}));

router.get('/meetings/:id', requirePermission('office.view'), asyncHandler(async (req, res) => {
  const meeting = await prisma.officeMeeting.findFirst({ where: { tenantId: tid(req), id: req.params.id }, include: meetingInclude });
  if (!meeting) throw ApiError.notFound('جلسه یافت نشد');
  res.json({ meeting });
}));

router.post('/meetings', requirePermission('office.create'), validate(meetingSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof meetingSchema>;
  const meeting = await prisma.officeMeeting.create({ data: { tenantId: tid(req), ...b, title: b.title.trim(), createdById: req.auth!.userId }, include: meetingInclude });
  res.status(201).json({ meeting });
}));

router.patch('/meetings/:id', requirePermission('office.edit'), validate(meetingSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeMeeting.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('جلسه یافت نشد');
  const meeting = await prisma.officeMeeting.update({ where: { id: existing.id }, data: req.body as Partial<z.infer<typeof meetingSchema>>, include: meetingInclude });
  res.json({ meeting });
}));

router.delete('/meetings/:id', requirePermission('office.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeMeeting.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('جلسه یافت نشد');
  await prisma.officeMeeting.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// Meeting action items
const actionSchema = z.object({ description: z.string().min(1), assignee: z.string().optional().nullable(), dueDate: z.coerce.date().optional().nullable() });
router.post('/meetings/:id/actions', requirePermission('office.edit'), validate(actionSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const meeting = await prisma.officeMeeting.findFirst({ where: { tenantId, id: req.params.id } });
  if (!meeting) throw ApiError.notFound('جلسه یافت نشد');
  const b = req.body as z.infer<typeof actionSchema>;
  const action = await prisma.officeMeetingAction.create({ data: { tenantId, meetingId: meeting.id, description: b.description.trim(), assignee: b.assignee ?? null, dueDate: b.dueDate ?? null } });
  res.status(201).json({ action });
}));
router.patch('/meetings/:id/actions/:actionId', requirePermission('office.edit'), validate(z.object({ done: z.boolean().optional(), description: z.string().optional(), assignee: z.string().optional().nullable(), dueDate: z.coerce.date().optional().nullable() })), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeMeetingAction.findFirst({ where: { tenantId, id: req.params.actionId, meetingId: req.params.id } });
  if (!existing) throw ApiError.notFound('اقدام یافت نشد');
  const action = await prisma.officeMeetingAction.update({ where: { id: existing.id }, data: req.body as Record<string, unknown> });
  res.json({ action });
}));
router.delete('/meetings/:id/actions/:actionId', requirePermission('office.edit'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.officeMeetingAction.findFirst({ where: { tenantId, id: req.params.actionId, meetingId: req.params.id } });
  if (!existing) throw ApiError.notFound('اقدام یافت نشد');
  await prisma.officeMeetingAction.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

router.get('/overview', requirePermission('office.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const [incoming, outgoing, meetings, openActions] = await Promise.all([
    prisma.officeLetter.count({ where: { tenantId, direction: 'incoming' } }),
    prisma.officeLetter.count({ where: { tenantId, direction: 'outgoing' } }),
    prisma.officeMeeting.count({ where: { tenantId } }),
    prisma.officeMeetingAction.count({ where: { tenantId, done: false } }),
  ]);
  res.json({ incoming, outgoing, meetings, openActions });
}));

export default router;
