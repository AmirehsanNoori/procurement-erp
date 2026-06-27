import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

// Mounted at /api/:tenantId/control-center behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Exact IOID Excel column headers (spec §12)
const IOID_HEADER_ORDER = [
  'ROW',
  'QUOTE NO',
  'ORDER NO',
  'TITLE',
  'CATEGORY',
  'DOCUMENT DATE',
  'RECEIVED DATE',
  'WEEKLY SEGMANTATION (SEGM - MONTH)',
  'RECEIVED PERCENTAGE',
  'COST',
  'REMARK',
  'PAYMENT STATUS',
] as const;

function derivePaymentStatus(invoiceStatus: string | null | undefined): string {
  if (!invoiceStatus) return '';
  if (invoiceStatus === 'پرداخت کامل') return 'Paid';
  if (invoiceStatus === 'نیمه پرداخت') return 'Partial';
  if (invoiceStatus === 'در انتظار بودجه') return 'No Budget';
  if (invoiceStatus === 'کنسل شده') return 'Cancelled';
  return 'Pending';
}

function toDateOrNull(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ── GET /api/:tenantId/control-center ──────────────────────────────────────
router.get(
  '/',
  requirePermission('control_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim();

    const requests = await prisma.request.findMany({
      where: {
        tenantId,
        archived: false,
        ...(search
          ? {
              OR: [
                { requestNumber: { contains: search, mode: 'insensitive' } },
                { orderNo: { contains: search, mode: 'insensitive' } },
                { title: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        invoices: {
          select: { id: true, status: true, invoiceNumber: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ ioidRow: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = requests.map((r) => ({
      id: r.id,
      ioidRow: r.ioidRow,
      requestNumber: r.requestNumber,
      orderNo: r.orderNo,
      title: r.title,
      category: r.category,
      documentDate: r.documentDate,
      receivedDate: r.receivedDate,
      weeklySegmentation: r.weeklySegmentation,
      receivedPercentage: r.receivedPercentage != null ? Number(r.receivedPercentage) : null,
      cost: r.cost != null ? Number(r.cost) : null,
      ioidRemark: r.ioidRemark,
      paymentStatus: derivePaymentStatus(r.invoices[0]?.status),
      invoiceNumber: r.invoices[0]?.invoiceNumber ?? null,
      invoiceStatus: r.invoices[0]?.status ?? null,
    }));

    res.json({ rows, total: rows.length });
  })
);

// ── POST /api/:tenantId/control-center/import ──────────────────────────────
// Must be registered BEFORE /:id so Express doesn't match "import" as an id.
router.post(
  '/import',
  requirePermission('control_center.view'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('فایل Excel ارسال نشد');
    const tenantId = req.tenant!.tenantId;

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    if (!wb.SheetNames.length) throw ApiError.badRequest('فایل Excel شیت ندارد');

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });
    if (rows.length === 0) throw ApiError.badRequest('هیچ ردیفی در فایل یافت نشد');

    let created = 0, updated = 0, skipped = 0;

    for (const row of rows) {
      const quoteNo = String(row['QUOTE NO'] ?? '').trim();
      if (!quoteNo) { skipped++; continue; }

      const patch: Record<string, unknown> = {
        updatedById: req.auth!.userId,
      };

      if (row['ORDER NO'] != null) patch.orderNo = String(row['ORDER NO']).trim() || null;
      if (row['TITLE'] != null) patch.title = String(row['TITLE']).trim() || null;
      if (row['CATEGORY'] != null) patch.category = String(row['CATEGORY']).trim() || null;

      const docDate = toDateOrNull(row['DOCUMENT DATE']);
      if (docDate !== null) patch.documentDate = docDate;

      const rcvDate = toDateOrNull(row['RECEIVED DATE']);
      if (rcvDate !== null) patch.receivedDate = rcvDate;

      const weekly = row['WEEKLY SEGMANTATION (SEGM - MONTH)'];
      if (weekly != null) patch.weeklySegmentation = String(weekly).trim() || null;

      const pct = row['RECEIVED PERCENTAGE'];
      if (pct != null && pct !== '') patch.receivedPercentage = Number(pct);

      const cost = row['COST'];
      if (cost != null && cost !== '') patch.cost = Number(cost);

      const remark = row['REMARK'];
      if (remark != null) patch.ioidRemark = String(remark).trim() || null;

      const rowNum = row['ROW'];
      if (rowNum != null && rowNum !== '') {
        const n = parseInt(String(rowNum), 10);
        if (!isNaN(n)) patch.ioidRow = n;
      }

      const existing = await prisma.request.findFirst({ where: { tenantId, requestNumber: quoteNo } });

      if (existing) {
        await prisma.request.update({ where: { id: existing.id }, data: patch });
        updated++;
      } else {
        await prisma.request.create({
          data: {
            ...patch,
            tenantId,
            requestNumber: quoteNo,
            status: 'جدید',
            createdById: req.auth!.userId,
          },
        });
        created++;
      }
    }

    res.json({ ok: true, created, updated, skipped, total: rows.length });
  })
);

// ── GET /api/:tenantId/control-center/export ───────────────────────────────
router.get(
  '/export',
  requirePermission('control_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;

    const requests = await prisma.request.findMany({
      where: { tenantId, archived: false },
      include: {
        invoices: {
          select: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ ioidRow: 'asc' }, { createdAt: 'asc' }],
    });

    const excelRows = requests.map((r, idx) => ({
      'ROW': r.ioidRow ?? idx + 1,
      'QUOTE NO': r.requestNumber,
      'ORDER NO': r.orderNo ?? '',
      'TITLE': r.title ?? '',
      'CATEGORY': r.category ?? '',
      'DOCUMENT DATE': r.documentDate ? r.documentDate.toISOString().slice(0, 10) : '',
      'RECEIVED DATE': r.receivedDate ? r.receivedDate.toISOString().slice(0, 10) : '',
      'WEEKLY SEGMANTATION (SEGM - MONTH)': r.weeklySegmentation ?? '',
      'RECEIVED PERCENTAGE': r.receivedPercentage != null ? Number(r.receivedPercentage) : '',
      'COST': r.cost != null ? Number(r.cost) : '',
      'REMARK': r.ioidRemark ?? '',
      'PAYMENT STATUS': derivePaymentStatus(r.invoices[0]?.status),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows, { header: IOID_HEADER_ORDER as unknown as string[] });
    XLSX.utils.book_append_sheet(wb, ws, 'IOID');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    res.setHeader('Content-Disposition', 'attachment; filename="ioid-export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  })
);

// ── PATCH /api/:tenantId/control-center/:id ────────────────────────────────
// Warehouse role: receivedDate, receivedPercentage, ioidRemark only.
// Full editors (requests.edit): all IOID fields.
const patchSchema = z.object({
  receivedDate: z.coerce.date().optional().nullable(),
  receivedPercentage: z.coerce.number().optional().nullable(),
  ioidRemark: z.string().optional().nullable(),
  ioidRow: z.coerce.number().int().optional().nullable(),
  orderNo: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  documentDate: z.coerce.date().optional().nullable(),
  weeklySegmentation: z.string().optional().nullable(),
  cost: z.coerce.number().optional().nullable(),
});

router.patch(
  '/:id',
  requirePermission('control_center.edit'),
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('درخواست یافت نشد');

    const perms = new Set(req.tenant!.permissions);
    const isFullEditor = perms.has('requests.edit');
    const body = req.body as z.infer<typeof patchSchema>;
    const data: Record<string, unknown> = { updatedById: req.auth!.userId };

    // All control_center.edit users can update delivery/receipt fields
    if (body.receivedDate !== undefined) data.receivedDate = body.receivedDate;
    if (body.receivedPercentage !== undefined) data.receivedPercentage = body.receivedPercentage;
    if (body.ioidRemark !== undefined) data.ioidRemark = body.ioidRemark;

    // Only full editors (Officer / Manager) can update non-delivery IOID fields
    if (isFullEditor) {
      if (body.ioidRow !== undefined) data.ioidRow = body.ioidRow;
      if (body.orderNo !== undefined) data.orderNo = body.orderNo;
      if (body.title !== undefined) data.title = body.title;
      if (body.category !== undefined) data.category = body.category;
      if (body.documentDate !== undefined) data.documentDate = body.documentDate;
      if (body.weeklySegmentation !== undefined) data.weeklySegmentation = body.weeklySegmentation;
      if (body.cost !== undefined) data.cost = body.cost;
    }

    const request = await prisma.request.update({ where: { id: existing.id }, data });
    res.json({ request });
  })
);

export default router;
