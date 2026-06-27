import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

// Plan definitions — feature limits per plan
export const PLANS: Record<string, {
  label: string;
  maxUsers: number;
  maxRequests: number;      // -1 = unlimited
  priceMonthly: number;
  features: string[];
}> = {
  free: {
    label: 'رایگان',
    maxUsers: 5,
    maxRequests: 50,
    priceMonthly: 0,
    features: ['درخواست‌های خرید', 'پیش‌فاکتور', 'فاکتور پایه', 'داشبورد'],
  },
  pro: {
    label: 'حرفه‌ای',
    maxUsers: 25,
    maxRequests: -1,
    priceMonthly: 2_500_000,
    features: [
      'همه امکانات رایگان',
      'بودجه و تحلیل',
      'داشبورد مدیریتی',
      'مکاتبات اداری',
      'گزارش هزینه',
      'CRM تأمین‌کننده',
      'گردش‌کار تأیید',
      'گانت و مقایسه RFQ',
    ],
  },
  enterprise: {
    label: 'سازمانی',
    maxUsers: -1,
    maxRequests: -1,
    priceMonthly: 8_000_000,
    features: [
      'همه امکانات حرفه‌ای',
      'کاربران نامحدود',
      'پشتیبانی اختصاصی',
      'SLA 99.9٪',
      'استقرار اختصاصی',
      'گزارش‌های سفارشی',
    ],
  },
};

// ── GET /billing ─── Current subscription info ──────────────────────────────
router.get(
  '/',
  requirePermission('billing.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true, name: true, plan: true, planExpiresAt: true,
        trialEndsAt: true, maxUsers: true, contactEmail: true, billingName: true,
        _count: { select: { tenantUsers: true } },
      },
    });

    const userCount = tenant._count.tenantUsers;
    const plan = PLANS[tenant.plan] ?? PLANS.free;
    const isExpired = tenant.planExpiresAt ? new Date(tenant.planExpiresAt) < new Date() : false;

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        planLabel: plan.label,
        planExpiresAt: tenant.planExpiresAt,
        trialEndsAt: tenant.trialEndsAt,
        maxUsers: tenant.maxUsers,
        contactEmail: tenant.contactEmail,
        billingName: tenant.billingName,
        isExpired,
        userCount,
      },
      planDetails: plan,
      allPlans: PLANS,
    });
  })
);

// ── PATCH /billing ─── Update contact info ──────────────────────────────────
router.patch(
  '/',
  requirePermission('billing.manage'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const { contactEmail, billingName } = req.body as {
      contactEmail?: string;
      billingName?: string;
    };
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { contactEmail, billingName },
    });
    res.json({ ok: true, tenant });
  })
);

// ── POST /billing/upgrade ─── Simulate plan upgrade ─────────────────────────
router.post(
  '/upgrade',
  requirePermission('billing.manage'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const { targetPlan } = req.body as { targetPlan: string };
    if (!PLANS[targetPlan]) {
      res.status(400).json({ error: 'پلن نامعتبر است' });
      return;
    }

    const plan = PLANS[targetPlan];
    const now = new Date();
    const expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: targetPlan,
        planExpiresAt: expiresAt,
        maxUsers: plan.maxUsers === -1 ? 9999 : plan.maxUsers,
      },
    });

    // Create a billing invoice record
    if (plan.priceMonthly > 0) {
      await prisma.billingInvoice.create({
        data: {
          tenantId,
          plan: targetPlan,
          amount: plan.priceMonthly,
          status: 'پرداخت شده',
          periodStart: now,
          periodEnd: expiresAt,
          notes: `ارتقاء به پلن ${plan.label}`,
        },
      });
    }

    res.json({ ok: true, tenant, message: `پلن با موفقیت به ${plan.label} ارتقاء یافت` });
  })
);

// ── GET /billing/invoices ─── Billing history ────────────────────────────────
router.get(
  '/invoices',
  requirePermission('billing.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const invoices = await prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ invoices });
  })
);

export default router;
