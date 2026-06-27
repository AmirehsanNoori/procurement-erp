import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { env } from '../../config/env';

// Mounted at /api/:tenantId/documents behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const VALID_ENTITY_TYPES = [
  'request', 'quotation', 'invoice', 'budget', 'supplier', 'payment',
] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

const ENTITY_TYPE_FA: Record<EntityType, string> = {
  request: 'درخواست',
  quotation: 'پیش‌فاکتور',
  invoice: 'فاکتور',
  budget: 'بودجه',
  supplier: 'تأمین‌کننده',
  payment: 'پرداخت',
};

// Allow up to maxUploadMb per file (default 20 MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    // Block dangerous executables; allow everything else.
    const blocked = /\.(exe|bat|cmd|sh|msi|dll|so|php|jsp|aspx?)$/i;
    if (blocked.test(file.originalname)) {
      return cb(new Error('نوع فایل مجاز نیست'));
    }
    cb(null, true);
  },
});

/** Resolve (and create if needed) the per-entity upload directory. */
function resolveUploadDir(tenantId: string, entityType: string, entityId: string): string {
  const dir = path.resolve(env.uploadDir, tenantId, entityType, entityId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Safe filename: uuid + original extension (strips path traversal). */
function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().slice(0, 10); // max 10-char ext
  return `${crypto.randomUUID()}${ext}`;
}

// ── GET /api/:tenantId/documents ──────────────────────────────────────────
router.get(
  '/',
  requirePermission('document_center.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const docs = await prisma.document.findMany({
      where: {
        tenantId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(search
          ? {
              OR: [
                { originalFilename: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { entityType: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Attach human-readable entity labels
    const enriched = docs.map((d) => ({
      ...d,
      entityTypeLabel: ENTITY_TYPE_FA[d.entityType as EntityType] ?? d.entityType,
      size: d.size ?? 0,
    }));

    res.json({ documents: enriched, total: enriched.length });
  })
);

// ── POST /api/:tenantId/documents ─────────────────────────────────────────
const uploadBodySchema = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES),
  entityId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'شناسه نامعتبر'),
  category: z.string().optional(),
});

router.post(
  '/',
  requirePermission('document_center.upload_document'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('فایل ارسال نشد');
    const tenantId = req.tenant!.tenantId;

    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('داده نامعتبر', parsed.error.flatten());
    }
    const { entityType, entityId, category } = parsed.data;

    const dir = resolveUploadDir(tenantId, entityType, entityId);
    const filename = safeFilename(req.file.originalname);
    const absPath = path.join(dir, filename);
    fs.writeFileSync(absPath, req.file.buffer);

    const storagePath = path.join(tenantId, entityType, entityId, filename);

    const doc = await prisma.document.create({
      data: {
        tenantId,
        entityType,
        entityId,
        category: category?.trim() || null,
        filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storagePath,
        uploadedById: req.auth!.userId,
      },
    });

    res.status(201).json({ document: { ...doc, entityTypeLabel: ENTITY_TYPE_FA[entityType] } });
  })
);

// ── GET /api/:tenantId/documents/:id ─────────────────────────────────────
router.get(
  '/:id',
  requirePermission('document_center.view_document'),
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.tenantId },
    });
    if (!doc) throw ApiError.notFound('سند یافت نشد');
    res.json({ document: { ...doc, entityTypeLabel: ENTITY_TYPE_FA[doc.entityType as EntityType] ?? doc.entityType } });
  })
);

// ── GET /api/:tenantId/documents/:id/file ────────────────────────────────
// ?inline=true  → preview in browser (Content-Disposition: inline)
// default       → force download (Content-Disposition: attachment)
router.get(
  '/:id/file',
  requirePermission('document_center.view_document'),
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.tenantId },
    });
    if (!doc) throw ApiError.notFound('سند یافت نشد');

    const absPath = path.resolve(env.uploadDir, doc.storagePath);

    // Ensure the resolved path stays within the upload directory (path traversal guard).
    const uploadRoot = path.resolve(env.uploadDir);
    if (!absPath.startsWith(uploadRoot + path.sep) && absPath !== uploadRoot) {
      throw ApiError.forbidden('دسترسی غیرمجاز به فایل');
    }

    if (!fs.existsSync(absPath)) throw ApiError.notFound('فایل روی دیسک یافت نشد');

    const inline = req.query.inline === 'true';
    const disposition = inline ? 'inline' : 'attachment';
    const safeName = encodeURIComponent(doc.originalFilename ?? doc.filename);

    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
    if (doc.mimeType) res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Length', String(doc.size ?? fs.statSync(absPath).size));

    const stream = fs.createReadStream(absPath);
    stream.pipe(res);
  })
);

// ── DELETE /api/:tenantId/documents/:id ──────────────────────────────────
router.delete(
  '/:id',
  requirePermission('document_center.delete_document'),
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.tenantId },
    });
    if (!doc) throw ApiError.notFound('سند یافت نشد');

    // Remove from DB first; then attempt disk cleanup (best-effort).
    await prisma.document.delete({ where: { id: doc.id } });

    try {
      const absPath = path.resolve(env.uploadDir, doc.storagePath);
      const uploadRoot = path.resolve(env.uploadDir);
      if (absPath.startsWith(uploadRoot + path.sep) && fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    } catch {
      // Non-fatal: DB row is already gone; log silently.
    }

    res.json({ ok: true });
  })
);

export default router;
