import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();

const schema = z.object({
  letterNumber: z.string().optional().nullable(),
  direction: z.enum(['صادره', 'وارده']),
  subject: z.string().min(1),
  body: z.string().optional().nullable(),
  senderName: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  letterDate: dateField,
  receivedDate: dateField,
  priority: z.enum(['عادی', 'فوری', 'خیلی‌فوری']).optional(),
  status: z.enum(['ثبت شده', 'در جریان', 'بایگانی', 'پاسخ داده شده']).optional(),
  relatedRequestId: z.string().optional().nullable(),
  relatedInvoiceId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const include = { request: { select: { id: true, requestNumber: true } }, invoice: { select: { id: true, invoiceNumber: true } } } as const;

router.get('/', requirePermission('correspondence.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim();
    const direction = req.query.direction as string | undefined;
    const status = req.query.status as string | undefined;
    const where: Prisma.CorrespondenceWhereInput = {
      tenantId,
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { letterNumber: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { senderName: { contains: search, mode: 'insensitive' } },
          { recipientName: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const letters = await prisma.correspondence.findMany({ where, include, orderBy: { createdAt: 'desc' } });
    res.json({ letters, total: letters.length });
  })
);

router.post('/', requirePermission('correspondence.create'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const letter = await prisma.correspondence.create({
      data: { ...req.body, tenantId, createdById: req.auth!.userId },
      include,
    });
    res.status(201).json({ letter });
  })
);

router.get('/:id', requirePermission('correspondence.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const letter = await prisma.correspondence.findFirst({ where: { id: req.params.id, tenantId }, include });
    if (!letter) throw ApiError.notFound('نامه یافت نشد');
    res.json({ letter });
  })
);

router.patch('/:id', requirePermission('correspondence.edit'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.correspondence.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('نامه یافت نشد');
    const letter = await prisma.correspondence.update({ where: { id: existing.id }, data: req.body, include });
    res.json({ letter });
  })
);

router.delete('/:id', requirePermission('correspondence.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.correspondence.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('نامه یافت نشد');
    await prisma.correspondence.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;
