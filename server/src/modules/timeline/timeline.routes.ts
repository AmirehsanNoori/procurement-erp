import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const eventSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  eventType: z.string().min(1),
  eventDate: z.coerce.date().optional().nullable(),
  supplier: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const ENTITY_TYPE_FA: Record<string, string> = {
  request: 'درخواست',
  quotation: 'پیش‌فاکتور',
  invoice: 'فاکتور',
  payment: 'پرداخت',
  budget: 'بودجه',
  supplier: 'تأمین‌کننده',
  task: 'وظیفه',
  document: 'سند',
  system: 'سیستم',
};

const EVENT_TYPE_FA: Record<string, string> = {
  created: 'ایجاد شد',
  updated: 'ویرایش شد',
  status_changed: 'وضعیت تغییر کرد',
  archived: 'بایگانی شد',
  unarchived: 'از بایگانی خارج شد',
  converted: 'تبدیل شد',
  payment_registered: 'پرداخت ثبت شد',
  document_uploaded: 'سند بارگذاری شد',
  note: 'یادداشت',
  followup: 'پیگیری',
  delivery: 'تحویل',
};

// ── GET /api/:tenantId/timeline ───────────────────────────────────────────────
router.get(
  '/',
  requirePermission('activity_timeline.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    const where: Prisma.TimelineEventWhereInput = {
      tenantId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(search
        ? {
            OR: [
              { notes: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
              { supplier: { contains: search, mode: 'insensitive' } },
              { eventType: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const events = await prisma.timelineEvent.findMany({
      where,
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    // Enrich with Persian labels and auto-generated summary text
    const enriched = events.map((e) => ({
      ...e,
      entityTypeLabel: ENTITY_TYPE_FA[e.entityType] ?? e.entityType,
      eventTypeLabel: EVENT_TYPE_FA[e.eventType] ?? e.eventType,
    }));

    res.json({ events: enriched, total: enriched.length });
  })
);

// ── POST /api/:tenantId/timeline ──────────────────────────────────────────────
router.post(
  '/',
  requirePermission('activity_timeline.view'),
  validate(eventSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { fullName: true },
    });

    const event = await prisma.timelineEvent.create({
      data: {
        tenantId,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        eventType: req.body.eventType ?? 'note',
        eventDate: req.body.eventDate ?? new Date(),
        userId: req.auth!.userId,
        userName: user?.fullName ?? null,
        supplier: req.body.supplier ?? null,
        reference: req.body.reference ?? null,
        notes: req.body.notes ?? null,
      },
    });

    res.status(201).json({
      event: {
        ...event,
        entityTypeLabel: ENTITY_TYPE_FA[event.entityType] ?? event.entityType,
        eventTypeLabel: EVENT_TYPE_FA[event.eventType] ?? event.eventType,
      },
    });
  })
);

export default router;
