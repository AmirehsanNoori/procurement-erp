import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/ai behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });
const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;

interface Hit { type: string; typeFa: string; id: string; label: string; sublabel: string; path: string; }

/** Unified enterprise search across modules (جستجوی سازمانی). */
router.get('/search', requirePermission('ai.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const q = (req.query.q as string | undefined)?.trim();
  const terms = searchTerms(q);
  if (!q || terms.length === 0) return res.json({ hits: [] });
  const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  const or = (fields: string[]) => ({ OR: terms.flatMap((v) => fields.map((f) => ({ [f]: ci(v) }))) });

  const [requests, invoices, suppliers, products, contracts, tickets, employees, letters, pos] = await Promise.all([
    prisma.request.findMany({ where: { tenantId, ...or(['requestNumber', 'title']) }, select: { id: true, requestNumber: true, title: true }, take: 5 }),
    prisma.invoice.findMany({ where: { tenantId, ...or(['invoiceNumber']) }, select: { id: true, invoiceNumber: true, totalAmount: true }, take: 5 }),
    prisma.supplier.findMany({ where: { tenantId, ...or(['name']) }, select: { id: true, name: true, phone: true }, take: 5 }),
    prisma.product.findMany({ where: { tenantId, ...or(['code', 'name']) }, select: { id: true, code: true, name: true }, take: 5 }),
    prisma.contract.findMany({ where: { tenantId, ...or(['contractNumber', 'title']) }, select: { id: true, contractNumber: true, title: true }, take: 5 }),
    prisma.ticket.findMany({ where: { tenantId, ...or(['subject']) }, select: { id: true, number: true, subject: true }, take: 5 }),
    prisma.hrEmployee.findMany({ where: { tenantId, ...or(['fullName', 'employeeCode', 'position']) }, select: { id: true, fullName: true, position: true }, take: 5 }),
    prisma.officeLetter.findMany({ where: { tenantId, ...or(['letterNumber', 'subject']) }, select: { id: true, letterNumber: true, subject: true }, take: 5 }),
    prisma.purchaseOrder.findMany({ where: { tenantId, ...or(['poNumber']) }, select: { id: true, poNumber: true, totalAmount: true }, take: 5 }),
  ]);

  const hits: Hit[] = [
    ...requests.map((r) => ({ type: 'request', typeFa: 'درخواست', id: r.id, label: r.requestNumber, sublabel: r.title ?? '', path: '/requests' })),
    ...invoices.map((i) => ({ type: 'invoice', typeFa: 'فاکتور', id: i.id, label: i.invoiceNumber, sublabel: `${Number(i.totalAmount).toLocaleString('fa-IR')} ریال`, path: '/invoices' })),
    ...suppliers.map((s) => ({ type: 'supplier', typeFa: 'تأمین‌کننده', id: s.id, label: s.name, sublabel: s.phone ?? '', path: '/suppliers' })),
    ...products.map((p) => ({ type: 'product', typeFa: 'کالا', id: p.id, label: p.name, sublabel: p.code, path: '/inventory/products' })),
    ...contracts.map((c) => ({ type: 'contract', typeFa: 'قرارداد', id: c.id, label: c.contractNumber, sublabel: c.title, path: '/contracts' })),
    ...tickets.map((t) => ({ type: 'ticket', typeFa: 'تیکت', id: t.id, label: `#${t.number}`, sublabel: t.subject, path: '/ticketing/list' })),
    ...employees.map((e) => ({ type: 'employee', typeFa: 'کارمند', id: e.id, label: e.fullName, sublabel: e.position ?? '', path: '/hr/employees' })),
    ...letters.map((l) => ({ type: 'letter', typeFa: 'نامه', id: l.id, label: l.letterNumber, sublabel: l.subject, path: '/office/letters' })),
    ...pos.map((p) => ({ type: 'po', typeFa: 'سفارش خرید', id: p.id, label: p.poNumber, sublabel: `${Number(p.totalAmount).toLocaleString('fa-IR')} ریال`, path: '/purchase-orders' })),
  ];
  res.json({ hits });
}));

/** Proactive cross-module insights & recommendations (بینش‌ها و پیشنهادها). */
router.get('/insights', requirePermission('ai.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const [contractsExpiring, guaranteesExpiring, pendingLeaves, urgentTickets, openTickets, draftJournals, products, levels] = await Promise.all([
    prisma.contract.count({ where: { tenantId, status: { in: ['active', 'renewed'] }, endDate: { not: null, lte: in30, gte: now } } }),
    prisma.contractGuarantee.count({ where: { tenantId, status: 'active', expiryDate: { not: null, lte: in30, gte: now } } }),
    prisma.hrLeaveRequest.count({ where: { tenantId, status: 'pending' } }),
    prisma.ticket.count({ where: { tenantId, priority: 'urgent', status: { in: ['open', 'in_progress'] } } }),
    prisma.ticket.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
    prisma.finJournal.count({ where: { tenantId, status: 'draft' } }),
    prisma.product.findMany({ where: { tenantId, isActive: true, minStock: { not: null } }, select: { id: true, minStock: true } }),
    prisma.stockLevel.groupBy({ by: ['productId'], where: { tenantId }, _sum: { quantity: true } }),
  ]);
  const onHand = new Map(levels.map((l) => [l.productId, Number(l._sum.quantity ?? 0)]));
  const lowStock = products.filter((p) => (onHand.get(p.id) ?? 0) < Number(p.minStock)).length;

  const insights = [
    { key: 'contracts_expiring', severity: 'warning', title: 'قراردادهای رو به انقضا (۳۰ روز)', count: contractsExpiring, path: '/contracts/expiring' },
    { key: 'guarantees_expiring', severity: 'warning', title: 'ضمانت‌نامه‌های رو به انقضا (۳۰ روز)', count: guaranteesExpiring, path: '/contracts/expiring' },
    { key: 'low_stock', severity: 'warning', title: 'کالاهای زیر نقطهٔ سفارش', count: lowStock, path: '/inventory/low-stock' },
    { key: 'pending_leaves', severity: 'info', title: 'درخواست‌های مرخصی در انتظار', count: pendingLeaves, path: '/hr/leaves' },
    { key: 'urgent_tickets', severity: 'critical', title: 'تیکت‌های فوری باز', count: urgentTickets, path: '/ticketing/list' },
    { key: 'open_tickets', severity: 'info', title: 'تیکت‌های باز', count: openTickets, path: '/ticketing/list' },
    { key: 'draft_journals', severity: 'info', title: 'اسناد حسابداری پیش‌نویس (قطعی‌نشده)', count: draftJournals, path: '/finance/journals' },
  ];
  res.json({ insights, generatedAt: now.toISOString() });
}));

export default router;
