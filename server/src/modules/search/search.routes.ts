import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

// GET /api/:tenantId/search?q=
router.get(
  '/',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) throw ApiError.badRequest('حداقل ۲ کاراکتر برای جستجو الزامی است');

    const mode = 'insensitive' as const;

    const [suppliers, requests, invoices, quotations] = await Promise.all([
      prisma.supplier.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode } },
            { email: { contains: q, mode } },
            { phone: { contains: q, mode } },
            { contactPerson: { contains: q, mode } },
          ],
        },
        take: 5,
        select: { id: true, name: true, email: true },
      }),
      prisma.request.findMany({
        where: {
          tenantId,
          archived: false,
          OR: [
            { requestNumber: { contains: q, mode } },
            { title: { contains: q, mode } },
            { description: { contains: q, mode } },
            { orderNo: { contains: q, mode } },
          ],
        },
        take: 5,
        select: { id: true, requestNumber: true, title: true, status: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [
            { invoiceNumber: { contains: q, mode } },
            { batch: { contains: q, mode } },
            { accountingReference: { contains: q, mode } },
            { supplier: { name: { contains: q, mode } } },
          ],
        },
        take: 5,
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true, supplier: { select: { name: true } } },
      }),
      prisma.quotation.findMany({
        where: {
          tenantId,
          archived: false,
          OR: [
            { quotationNumber: { contains: q, mode } },
            { supplier: { name: { contains: q, mode } } },
          ],
        },
        take: 5,
        select: { id: true, quotationNumber: true, status: true, supplier: { select: { name: true } } },
      }),
    ]);

    res.json({ q, suppliers, requests, invoices, quotations });
  })
);

export default router;
