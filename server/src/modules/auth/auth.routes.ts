import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { verifyPassword, hashPassword } from '../../auth/password';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '../../auth/tokens';
import { listUserTenants, resolveTenantAccess } from '../../rbac/access';
import { writeAudit, clientIp } from '../../lib/audit';
import { env } from '../../config/env';

const router = Router();

const REFRESH_COOKIE = 'erp_refresh';
const cookieOpts = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/api/auth',
};

function publicUser(u: { id: string; fullName: string; email: string; phone: string | null; isSuperAdmin: boolean; lastLoginAt: Date | null }) {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    isSuperAdmin: u.isSuperAdmin,
    lastLoginAt: u.lastLoginAt,
  };
}

// POST /api/auth/login
router.post(
  '/login',
  validate(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      await writeAudit({ action: 'auth.login_failed', metadata: { email }, ip: clientIp(req) });
      throw ApiError.unauthorized('ایمیل یا رمز عبور نادرست است');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);
    const tenants = await listUserTenants(user.id);

    await writeAudit({ action: 'auth.login', userId: user.id, ip: clientIp(req) });

    res
      .cookie(REFRESH_COOKIE, refreshToken, cookieOpts)
      .json({ accessToken, user: publicUser(user), tenants });
  })
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw ApiError.unauthorized('توکن تازه‌سازی موجود نیست');
    try {
      const { userId, token: newRefresh } = await rotateRefreshToken(token);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) throw ApiError.unauthorized();
      const accessToken = signAccessToken({ sub: user.id, email: user.email });
      res.cookie(REFRESH_COOKIE, newRefresh, cookieOpts).json({ accessToken });
    } catch {
      res.clearCookie(REFRESH_COOKIE, cookieOpts);
      throw ApiError.unauthorized('نشست منقضی شده است');
    }
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(REFRESH_COOKIE, cookieOpts).json({ ok: true });
  })
);

// GET /api/auth/me  (optionally ?tenantId= to include effective permissions)
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw ApiError.unauthorized();
    const tenants = await listUserTenants(user.id);

    let access = null;
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : tenants[0]?.tenantId;
    if (tenantId) access = await resolveTenantAccess(user.id, tenantId);

    res.json({ user: publicUser(user), tenants, access });
  })
);

// PATCH /api/auth/me — update own profile (name, phone)
router.patch(
  '/me',
  requireAuth,
  validate(z.object({ fullName: z.string().min(1).optional(), phone: z.string().nullable().optional() })),
  asyncHandler(async (req, res) => {
    const { fullName, phone } = req.body as { fullName?: string; phone?: string | null };
    const updated = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { ...(fullName !== undefined ? { fullName } : {}), ...(phone !== undefined ? { phone } : {}) },
    });
    res.json({ user: publicUser(updated) });
  })
);

// PATCH /api/auth/me/password — change own password
router.patch(
  '/me/password',
  requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw ApiError.unauthorized();
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw ApiError.badRequest('رمز عبور فعلی نادرست است');
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await writeAudit({ action: 'auth.password_changed', userId: user.id, ip: clientIp(req) });
    res.json({ ok: true });
  })
);

// ── POST /auth/register-tenant ─── Self-service tenant registration ──────────
// Public endpoint: creates a new tenant + admin user on the Free plan.
router.post(
  '/register-tenant',
  asyncHandler(async (req, res) => {
    const { orgName, orgCode, adminFullName, adminEmail, adminPassword } = req.body as {
      orgName: string;
      orgCode: string;
      adminFullName: string;
      adminEmail: string;
      adminPassword: string;
    };

    if (!orgName || !orgCode || !adminEmail || !adminPassword || !adminFullName) {
      res.status(400).json({ error: 'همه فیلدها الزامی هستند' });
      return;
    }
    if (adminPassword.length < 8) {
      res.status(400).json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد' });
      return;
    }

    const codeClean = orgCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!codeClean) {
      res.status(400).json({ error: 'کد سازمان نامعتبر است' });
      return;
    }

    const existing = await prisma.tenant.findUnique({ where: { code: codeClean } });
    if (existing) {
      res.status(409).json({ error: 'این کد سازمان قبلاً ثبت شده است' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است' });
      return;
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14-day trial

    // Find admin role (required to assign new user)
    const adminRole = await prisma.role.findFirst({ where: { name: 'admin' } })
      ?? await prisma.role.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!adminRole) {
      res.status(500).json({ error: 'پیکربندی سیستم ناقص است (نقش پیدا نشد)' });
      return;
    }

    const passwordHash = await hashPassword(adminPassword);

    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: orgName,
          code: codeClean,
          plan: 'free',
          trialEndsAt: trialEnd,
          maxUsers: 5,
          contactEmail: adminEmail,
        },
      });

      const user = await tx.user.create({
        data: {
          fullName: adminFullName,
          email: adminEmail,
          passwordHash,
          isActive: true,
        },
      });

      await tx.tenantUser.create({
        data: {
          tenantId: t.id,
          userId: user.id,
          roleId: adminRole.id,
        },
      });

      return t;
    });

    res.status(201).json({
      ok: true,
      tenant: { id: tenant.id, name: tenant.name, code: tenant.code, plan: 'free', trialEndsAt: trialEnd },
      message: 'سازمان با موفقیت ثبت شد. می‌توانید وارد سیستم شوید.',
    });
  })
);

export default router;
