import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { generateNotifications } from './notification.service';

const router = Router({ mergeParams: true });

// ── GET /api/:tenantId/notifications ─────────────────────────────────────────
router.get(
  '/',
  requirePermission('notification_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;

    // Refresh notifications from current DB state
    await generateNotifications(prisma, tenantId);

    const unreadOnly = req.query.unread === 'true';

    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const unreadCount = await prisma.notification.count({
      where: { tenantId, isRead: false },
    });

    res.json({ notifications, unreadCount });
  })
);

// ── GET /api/:tenantId/notifications/count ────────────────────────────────────
router.get(
  '/count',
  requirePermission('notification_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const count = await prisma.notification.count({ where: { tenantId, isRead: false } });
    res.json({ unreadCount: count });
  })
);

// ── PATCH /api/:tenantId/notifications/:id/read ───────────────────────────────
router.patch(
  '/:id/read',
  requirePermission('notification_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!notif) throw ApiError.notFound('اعلان یافت نشد');
    await prisma.notification.update({ where: { id: notif.id }, data: { isRead: true } });
    res.json({ ok: true });
  })
);

// ── POST /api/:tenantId/notifications/read-all ────────────────────────────────
router.post(
  '/read-all',
  requirePermission('notification_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const { count } = await prisma.notification.updateMany({
      where: { tenantId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true, updated: count });
  })
);

// ── DELETE /api/:tenantId/notifications/:id ───────────────────────────────────
router.delete(
  '/:id',
  requirePermission('notification_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!notif) throw ApiError.notFound('اعلان یافت نشد');
    await prisma.notification.delete({ where: { id: notif.id } });
    res.json({ ok: true });
  })
);

export default router;
