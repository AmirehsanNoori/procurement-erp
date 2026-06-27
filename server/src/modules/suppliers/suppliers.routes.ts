import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, num } from '../finance/calc';

const router = Router({ mergeParams: true });

const schema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get(
  '/',
  requirePermission('suppliers.view'),
  asyncHandler(async (req, res) => {
    const search = (req.query.search as string | undefined)?.trim();
    const where: Prisma.SupplierWhereInput = {
      tenantId: req.tenant!.tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ suppliers });
  })
);

// ── GET /api/:tenantId/suppliers/statement ────────────────────────────────────
// Must be defined BEFORE /:id to prevent Express matching "statement" as an ID.
router.get(
  '/statement',
  requirePermission('supplier_statement.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const [fin, invoicesWithRelations, suppliers] = await Promise.all([
      loadFinance(prisma, tenantId),
      prisma.invoice.findMany({
        where: { tenantId, archived: false },
        include: { budget: true, request: true },
      }),
      prisma.supplier.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    ]);
    const invRelMap = new Map(invoicesWithRelations.map((i) => [i.id, i]));

    const statement = suppliers.map((s) => {
      const supplierInvoices = fin.invoices.filter((inv) => inv.supplierId === s.id && !inv.archived);
      const totalInvoiced = supplierInvoices.reduce((a, inv) => a + num(inv.totalAmount), 0);
      const totalPaid = supplierInvoices.reduce((a, inv) => a + fin.supplierInvoicePaid(inv), 0);

      const invoiceIds = new Set(supplierInvoices.map((i) => i.id));
      const paymentsForSupplier = fin.payments.filter((p) => invoiceIds.has(p.invoiceId));
      const lastPayment = paymentsForSupplier
        .filter((p) => p.paymentDate)
        .sort((a, b) => new Date(b.paymentDate!).getTime() - new Date(a.paymentDate!).getTime())[0];

      return {
        id: s.id,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        invoiceCount: supplierInvoices.length,
        totalInvoiced,
        totalPaid,
        balance: totalInvoiced - totalPaid,
        lastPaymentDate: lastPayment?.paymentDate ?? null,
        invoices: supplierInvoices.map((inv) => {
          const rel = invRelMap.get(inv.id);
          const paid = fin.supplierInvoicePaid(inv);
          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            totalAmount: num(inv.totalAmount),
            paid,
            remaining: num(inv.totalAmount) - paid,
            status: fin.invoiceAutoStatus(inv),
            requestNumber: rel?.request?.requestNumber ?? '',
            budget: rel?.budget ? {
              name: rel.budget.name,
              monthJalali: rel.budget.monthJalali,
              yearJalali: rel.budget.yearJalali,
            } : null,
          };
        }),
      };
    });

    const totals = statement.reduce(
      (a, s) => ({
        totalInvoiced: a.totalInvoiced + s.totalInvoiced,
        totalPaid: a.totalPaid + s.totalPaid,
        balance: a.balance + s.balance,
      }),
      { totalInvoiced: 0, totalPaid: 0, balance: 0 }
    );

    res.json({ statement, totals });
  })
);

// GET /api/:tenantId/suppliers/:id/statement — single supplier financial summary
router.get(
  '/:id/statement',
  requirePermission('supplier_statement.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId } });
    if (!supplier) throw ApiError.notFound('تأمین‌کننده یافت نشد');
    const fin = await loadFinance(prisma, tenantId);
    const supplierInvoices = fin.invoices.filter((inv) => inv.supplierId === supplier.id && !inv.archived);
    const totalInvoiced = supplierInvoices.reduce((a, inv) => a + num(inv.totalAmount), 0);
    const totalPaid = supplierInvoices.reduce((a, inv) => a + fin.supplierInvoicePaid(inv), 0);
    const invoiceIds = new Set(supplierInvoices.map((i) => i.id));
    const paymentsForSupplier = fin.payments.filter((p) => invoiceIds.has(p.invoiceId));
    const lastPayment = paymentsForSupplier
      .filter((p) => p.paymentDate)
      .sort((a, b) => new Date(b.paymentDate!).getTime() - new Date(a.paymentDate!).getTime())[0];
    res.json({
      supplier: {
        id: supplier.id, name: supplier.name,
        contactPerson: supplier.contactPerson, phone: supplier.phone, email: supplier.email,
        invoiceCount: supplierInvoices.length,
        totalInvoiced, totalPaid,
        balance: totalInvoiced - totalPaid,
        lastPaymentDate: lastPayment?.paymentDate ?? null,
        invoices: supplierInvoices.map((inv) => ({
          id: inv.id, invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate, dueDate: inv.dueDate,
          totalAmount: num(inv.totalAmount),
          paid: fin.supplierInvoicePaid(inv),
          remaining: num(inv.totalAmount) - fin.supplierInvoicePaid(inv),
          status: fin.invoiceAutoStatus(inv),
        })),
      },
    });
  })
);

router.post(
  '/',
  requirePermission('suppliers.create'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.create({
      data: { ...req.body, tenantId: req.tenant!.tenantId, createdById: req.auth!.userId, updatedById: req.auth!.userId },
    });
    res.status(201).json({ supplier });
  })
);

router.patch(
  '/:id',
  requirePermission('suppliers.edit'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.tenantId } });
    if (!existing) throw ApiError.notFound('تأمین‌کننده یافت نشد');
    const supplier = await prisma.supplier.update({
      where: { id: existing.id },
      data: { ...req.body, updatedById: req.auth!.userId },
    });
    res.json({ supplier });
  })
);

router.delete(
  '/:id',
  requirePermission('suppliers.delete'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.tenantId } });
    if (!existing) throw ApiError.notFound('تأمین‌کننده یافت نشد');
    await prisma.supplier.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// ── CRM: Contacts ────────────────────────────────────────────────────────────

const contactSchema = z.object({
  fullName: z.string().min(1),
  role: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

router.get('/:id/contacts', requirePermission('suppliers.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const contacts = await prisma.supplierContact.findMany({
      where: { tenantId, supplierId: req.params.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ contacts });
  })
);

router.post('/:id/contacts', requirePermission('suppliers.edit'),
  validate(contactSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const contact = await prisma.supplierContact.create({
      data: { ...req.body, tenantId, supplierId: req.params.id },
    });
    res.status(201).json({ contact });
  })
);

router.patch('/:id/contacts/:contactId', requirePermission('suppliers.edit'),
  validate(contactSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.supplierContact.findFirst({ where: { id: req.params.contactId, tenantId } });
    if (!existing) throw ApiError.notFound('مخاطب یافت نشد');
    const contact = await prisma.supplierContact.update({ where: { id: existing.id }, data: req.body });
    res.json({ contact });
  })
);

router.delete('/:id/contacts/:contactId', requirePermission('suppliers.edit'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.supplierContact.findFirst({ where: { id: req.params.contactId, tenantId } });
    if (!existing) throw ApiError.notFound('مخاطب یافت نشد');
    await prisma.supplierContact.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// ── CRM: Interactions ─────────────────────────────────────────────────────────

const interactionSchema = z.object({
  type: z.string().optional(),
  subject: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  interactionDate: z.coerce.date().optional().nullable(),
  followUpDate: z.coerce.date().optional().nullable(),
});

router.get('/:id/interactions', requirePermission('suppliers.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const interactions = await prisma.supplierInteraction.findMany({
      where: { tenantId, supplierId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ interactions });
  })
);

router.post('/:id/interactions', requirePermission('suppliers.edit'),
  validate(interactionSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const interaction = await prisma.supplierInteraction.create({
      data: { ...req.body, tenantId, supplierId: req.params.id, createdById: req.auth!.userId },
    });
    res.status(201).json({ interaction });
  })
);

router.delete('/:id/interactions/:intId', requirePermission('suppliers.edit'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.supplierInteraction.findFirst({ where: { id: req.params.intId, tenantId } });
    if (!existing) throw ApiError.notFound('تعامل یافت نشد');
    await prisma.supplierInteraction.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// ── Blanket Orders ────────────────────────────────────────────────────────────

const blanketSchema = z.object({
  orderNumber: z.string().optional().nullable(),
  description: z.string().min(1),
  totalValue: z.coerce.number().min(0),
  usedValue: z.coerce.number().min(0).optional(),
  currency: z.string().optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

router.get('/:id/blanket-orders', requirePermission('suppliers.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const orders = await prisma.blanketOrder.findMany({
      where: { tenantId, supplierId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  })
);

router.post('/:id/blanket-orders', requirePermission('suppliers.edit'),
  validate(blanketSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const order = await prisma.blanketOrder.create({
      data: { ...req.body, tenantId, supplierId: req.params.id, createdById: req.auth!.userId },
    });
    res.status(201).json({ order });
  })
);

router.patch('/:id/blanket-orders/:orderId', requirePermission('suppliers.edit'),
  validate(blanketSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.blanketOrder.findFirst({ where: { id: req.params.orderId, tenantId } });
    if (!existing) throw ApiError.notFound('قرارداد یافت نشد');
    const order = await prisma.blanketOrder.update({ where: { id: existing.id }, data: req.body });
    res.json({ order });
  })
);

router.delete('/:id/blanket-orders/:orderId', requirePermission('suppliers.edit'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.blanketOrder.findFirst({ where: { id: req.params.orderId, tenantId } });
    if (!existing) throw ApiError.notFound('قرارداد یافت نشد');
    await prisma.blanketOrder.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;
