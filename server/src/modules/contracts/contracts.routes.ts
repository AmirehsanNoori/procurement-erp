import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/contracts behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;

const CONTRACT_TYPES = ['purchase', 'service', 'lease', 'framework', 'other'] as const;
const CONTRACT_STATUS = ['draft', 'active', 'suspended', 'expired', 'terminated', 'renewed', 'closed'] as const;

const contractSchema = z.object({
  contractNumber: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(CONTRACT_TYPES).optional(),
  partyName: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  value: z.coerce.number().min(0).optional(),
  currency: z.string().optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  autoRenew: z.boolean().optional(),
  renewalNoticeDays: z.coerce.number().int().min(0).optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const listInclude = { supplier: { select: { name: true } }, _count: { select: { amendments: true, guarantees: true } } };
const detailInclude = {
  supplier: { select: { name: true } },
  amendments: { orderBy: { date: 'desc' as const } },
  guarantees: { orderBy: { createdAt: 'desc' as const } },
};

// ── Contracts ────────────────────────────────────────────────────────────────
router.get('/', requirePermission('contracts.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const terms = searchTerms(req.query.search as string | undefined);
  const where: Prisma.ContractWhereInput = {
    tenantId,
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(req.query.type ? { type: req.query.type as string } : {}),
    ...(terms.length ? { OR: terms.flatMap((v) => [
      { contractNumber: { contains: v, mode: 'insensitive' as const } },
      { title: { contains: v, mode: 'insensitive' as const } },
      { partyName: { contains: v, mode: 'insensitive' as const } },
      { supplier: { name: { contains: v, mode: 'insensitive' as const } } },
    ]) } : {}),
  };
  const contracts = await prisma.contract.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ contracts });
}));

/** Contracts and guarantees expiring within `days` (default 30) — renewal watch. */
router.get('/expiring', requirePermission('contracts.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  const [contracts, guarantees] = await Promise.all([
    prisma.contract.findMany({ where: { tenantId, status: { in: ['active', 'renewed'] }, endDate: { not: null, lte: until } }, include: { supplier: { select: { name: true } } }, orderBy: { endDate: 'asc' } }),
    prisma.contractGuarantee.findMany({ where: { tenantId, status: 'active', expiryDate: { not: null, lte: until } }, include: { contract: { select: { contractNumber: true, title: true } } }, orderBy: { expiryDate: 'asc' } }),
  ]);
  res.json({ days, contracts, guarantees });
}));

router.get('/:id', requirePermission('contracts.view'), asyncHandler(async (req, res) => {
  const contract = await prisma.contract.findFirst({ where: { tenantId: tid(req), id: req.params.id }, include: detailInclude });
  if (!contract) throw ApiError.notFound('قرارداد یافت نشد');
  res.json({ contract });
}));

router.post('/', requirePermission('contracts.create'), validate(contractSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const b = req.body as z.infer<typeof contractSchema>;
  const dup = await prisma.contract.findFirst({ where: { tenantId, contractNumber: b.contractNumber.trim() } });
  if (dup) throw ApiError.conflict(`قرارداد با شماره «${b.contractNumber.trim()}» قبلاً ثبت شده است`);
  const contract = await prisma.contract.create({
    data: {
      tenantId, contractNumber: b.contractNumber.trim(), title: b.title.trim(), type: b.type ?? 'purchase',
      partyName: b.partyName ?? null, supplierId: b.supplierId ?? null, value: b.value ?? 0, currency: b.currency ?? 'ریال',
      startDate: b.startDate ?? null, endDate: b.endDate ?? null, autoRenew: b.autoRenew ?? false, renewalNoticeDays: b.renewalNoticeDays ?? null,
      description: b.description ?? null, notes: b.notes ?? null, createdById: req.auth!.userId,
    },
    include: detailInclude,
  });
  res.status(201).json({ contract });
}));

router.patch('/:id', requirePermission('contracts.edit'), validate(contractSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contract.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('قرارداد یافت نشد');
  const b = req.body as Partial<z.infer<typeof contractSchema>>;
  const contract = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      ...(b.title !== undefined ? { title: b.title.trim() } : {}),
      ...(b.type !== undefined ? { type: b.type } : {}),
      ...(b.partyName !== undefined ? { partyName: b.partyName } : {}),
      ...(b.supplierId !== undefined ? { supplierId: b.supplierId } : {}),
      ...(b.value !== undefined ? { value: b.value } : {}),
      ...(b.currency !== undefined ? { currency: b.currency } : {}),
      ...(b.startDate !== undefined ? { startDate: b.startDate } : {}),
      ...(b.endDate !== undefined ? { endDate: b.endDate } : {}),
      ...(b.autoRenew !== undefined ? { autoRenew: b.autoRenew } : {}),
      ...(b.renewalNoticeDays !== undefined ? { renewalNoticeDays: b.renewalNoticeDays } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.notes !== undefined ? { notes: b.notes } : {}),
    },
    include: detailInclude,
  });
  res.json({ contract });
}));

router.post('/:id/status', requirePermission('contracts.approve'), validate(z.object({ status: z.enum(CONTRACT_STATUS) })), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contract.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('قرارداد یافت نشد');
  const status = (req.body as { status: string }).status;
  const contract = await prisma.contract.update({
    where: { id: existing.id },
    data: { status, ...(status === 'active' && !existing.approvedAt ? { approvedById: req.auth!.userId, approvedAt: new Date() } : {}) },
    include: detailInclude,
  });
  res.json({ contract });
}));

router.delete('/:id', requirePermission('contracts.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contract.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('قرارداد یافت نشد');
  await prisma.contract.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Amendments (متمم) ────────────────────────────────────────────────────────
const amendmentSchema = z.object({
  amendmentNumber: z.string().min(1),
  date: z.coerce.date().optional(),
  description: z.string().optional().nullable(),
  valueChange: z.coerce.number().optional().nullable(),
  newEndDate: z.coerce.date().optional().nullable(),
  applyToContract: z.boolean().optional(), // also adjust the contract value/end date
});

router.post('/:id/amendments', requirePermission('contracts.edit'), validate(amendmentSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const contract = await prisma.contract.findFirst({ where: { tenantId, id: req.params.id } });
  if (!contract) throw ApiError.notFound('قرارداد یافت نشد');
  const b = req.body as z.infer<typeof amendmentSchema>;
  const amendment = await prisma.$transaction(async (tx) => {
    const a = await tx.contractAmendment.create({
      data: { tenantId, contractId: contract.id, amendmentNumber: b.amendmentNumber.trim(), date: b.date ?? new Date(), description: b.description ?? null, valueChange: b.valueChange ?? null, newEndDate: b.newEndDate ?? null, createdById: req.auth!.userId },
    });
    if (b.applyToContract) {
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          ...(b.valueChange ? { value: { increment: b.valueChange } } : {}),
          ...(b.newEndDate ? { endDate: b.newEndDate } : {}),
        },
      });
    }
    return a;
  });
  res.status(201).json({ amendment });
}));

router.delete('/:id/amendments/:amendmentId', requirePermission('contracts.edit'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contractAmendment.findFirst({ where: { tenantId, id: req.params.amendmentId, contractId: req.params.id } });
  if (!existing) throw ApiError.notFound('متمم یافت نشد');
  await prisma.contractAmendment.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Guarantees (ضمانت‌نامه) ──────────────────────────────────────────────────
const guaranteeSchema = z.object({
  type: z.enum(['performance', 'advance', 'bid', 'warranty', 'retention']).optional(),
  guaranteeNumber: z.string().optional().nullable(),
  amount: z.coerce.number().min(0).optional(),
  currency: z.string().optional(),
  bankName: z.string().optional().nullable(),
  issueDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  status: z.enum(['active', 'released', 'expired', 'claimed']).optional(),
  notes: z.string().optional().nullable(),
});

router.post('/:id/guarantees', requirePermission('contracts.edit'), validate(guaranteeSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const contract = await prisma.contract.findFirst({ where: { tenantId, id: req.params.id } });
  if (!contract) throw ApiError.notFound('قرارداد یافت نشد');
  const b = req.body as z.infer<typeof guaranteeSchema>;
  const guarantee = await prisma.contractGuarantee.create({
    data: { tenantId, contractId: contract.id, type: b.type ?? 'performance', guaranteeNumber: b.guaranteeNumber ?? null, amount: b.amount ?? 0, currency: b.currency ?? 'ریال', bankName: b.bankName ?? null, issueDate: b.issueDate ?? null, expiryDate: b.expiryDate ?? null, status: b.status ?? 'active', notes: b.notes ?? null },
  });
  res.status(201).json({ guarantee });
}));

router.patch('/:id/guarantees/:guaranteeId', requirePermission('contracts.edit'), validate(guaranteeSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contractGuarantee.findFirst({ where: { tenantId, id: req.params.guaranteeId, contractId: req.params.id } });
  if (!existing) throw ApiError.notFound('ضمانت‌نامه یافت نشد');
  const b = req.body as Partial<z.infer<typeof guaranteeSchema>>;
  const guarantee = await prisma.contractGuarantee.update({ where: { id: existing.id }, data: b });
  res.json({ guarantee });
}));

router.delete('/:id/guarantees/:guaranteeId', requirePermission('contracts.edit'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.contractGuarantee.findFirst({ where: { tenantId, id: req.params.guaranteeId, contractId: req.params.id } });
  if (!existing) throw ApiError.notFound('ضمانت‌نامه یافت نشد');
  await prisma.contractGuarantee.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
