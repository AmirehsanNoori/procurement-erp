import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.coerce.number().int().min(1).max(3).optional().default(2),
  dueDate: dateField,
  followUpDate: dateField,
  status: z.string().optional().default('در انتظار'),
  relatedRequestId: z.string().optional().nullable(),
  relatedInvoiceId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

// ── GET /api/:tenantId/tasks ──────────────────────────────────────────────────
router.get(
  '/',
  requirePermission('tasks.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim();
    const status = req.query.status as string | undefined;
    const priority = req.query.priority ? Number(req.query.priority) : undefined;
    const archived = req.query.archived === 'true';

    const where: Prisma.TaskWhereInput = {
      tenantId,
      archived,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const counts = await prisma.task.groupBy({
      by: ['status'],
      where: { tenantId, archived: false },
      _count: true,
    });

    res.json({ tasks, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  })
);

// ── POST /api/:tenantId/tasks ─────────────────────────────────────────────────
router.post(
  '/',
  requirePermission('tasks.view'),
  validate(taskSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const task = await prisma.task.create({
      data: {
        tenantId,
        ...req.body,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      },
    });
    res.status(201).json({ task });
  })
);

// ── PATCH /api/:tenantId/tasks/:id ────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermission('tasks.view'),
  validate(taskSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('وظیفه یافت نشد');
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: { ...req.body, updatedById: req.auth!.userId },
    });
    res.json({ task });
  })
);

// ── DELETE /api/:tenantId/tasks/:id ──────────────────────────────────────────
router.delete(
  '/:id',
  requirePermission('tasks.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('وظیفه یافت نشد');
    await prisma.task.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;
