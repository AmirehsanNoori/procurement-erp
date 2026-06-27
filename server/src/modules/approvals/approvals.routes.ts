import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const workflowSchema = z.object({
  name: z.string().min(1),
  entityType: z.enum(['invoice', 'quotation', 'request']),
  steps: z.array(z.object({
    label: z.string().min(1),
    requiredRole: z.string().optional(),
    order: z.number().int().min(0),
  })).min(1),
  isActive: z.boolean().optional(),
});

// ── Workflow Templates ──────────────────────────────────────────────────

router.get('/workflows', requirePermission('approvals.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const workflows = await prisma.approvalWorkflow.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    res.json({ workflows });
  })
);

router.post('/workflows', requirePermission('approvals.manage'),
  validate(workflowSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const workflow = await prisma.approvalWorkflow.create({
      data: { tenantId, name: req.body.name, entityType: req.body.entityType, steps: req.body.steps, isActive: req.body.isActive ?? true },
    });
    res.status(201).json({ workflow });
  })
);

router.patch('/workflows/:id', requirePermission('approvals.manage'),
  validate(workflowSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.approvalWorkflow.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('گردش کار یافت نشد');
    const workflow = await prisma.approvalWorkflow.update({ where: { id: existing.id }, data: req.body });
    res.json({ workflow });
  })
);

router.delete('/workflows/:id', requirePermission('approvals.manage'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.approvalWorkflow.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('گردش کار یافت نشد');
    await prisma.approvalWorkflow.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// ── Approval Instances ───────────────────────────────────────────────────

// GET instances for a specific entity
router.get('/entity/:entityType/:entityId', requirePermission('approvals.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const instances = await prisma.approvalInstance.findMany({
      where: { tenantId, entityType: req.params.entityType, entityId: req.params.entityId },
      include: {
        workflow: true,
        votes: { include: { user: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ instances });
  })
);

// GET all pending approvals for current user
router.get('/pending', requirePermission('approvals.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const instances = await prisma.approvalInstance.findMany({
      where: { tenantId, status: 'در انتظار' },
      include: {
        workflow: true,
        votes: { include: { user: { select: { id: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ instances });
  })
);

// POST start an approval for an entity
router.post('/start', requirePermission('approvals.request'),
  validate(z.object({
    workflowId: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const workflow = await prisma.approvalWorkflow.findFirst({ where: { id: req.body.workflowId, tenantId, isActive: true } });
    if (!workflow) throw ApiError.notFound('گردش کار یافت نشد یا غیرفعال است');

    const existing = await prisma.approvalInstance.findFirst({
      where: { tenantId, entityType: req.body.entityType, entityId: req.body.entityId, status: 'در انتظار' },
    });
    if (existing) throw ApiError.badRequest('این موجودیت در حال تأیید است');

    const instance = await prisma.approvalInstance.create({
      data: {
        tenantId,
        workflowId: req.body.workflowId,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        currentStep: 0,
        status: 'در انتظار',
        requestedById: req.auth!.userId,
        notes: req.body.notes,
      },
      include: { workflow: true, votes: true },
    });
    res.status(201).json({ instance });
  })
);

// POST vote on an approval instance
router.post('/:instanceId/vote', requirePermission('approvals.vote'),
  validate(z.object({
    decision: z.enum(['تأیید شده', 'رد شده']),
    notes: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const userId = req.auth!.userId;
    const instance = await prisma.approvalInstance.findFirst({
      where: { id: req.params.instanceId, tenantId },
      include: { workflow: true, votes: true },
    });
    if (!instance) throw ApiError.notFound('درخواست تأیید یافت نشد');
    if (instance.status !== 'در انتظار') throw ApiError.badRequest('این درخواست دیگر فعال نیست');

    const steps = instance.workflow.steps as { label: string; requiredRole?: string; order: number }[];
    const stepIndex = instance.currentStep;

    // Check if user already voted on this step
    const alreadyVoted = instance.votes.find((v) => v.step === stepIndex && v.userId === userId);
    if (alreadyVoted) throw ApiError.badRequest('شما قبلاً در این مرحله رأی داده‌اید');

    const vote = await prisma.approvalVote.create({
      data: { tenantId, instanceId: instance.id, step: stepIndex, userId, decision: req.body.decision, notes: req.body.notes },
      include: { user: { select: { id: true, fullName: true } } },
    });

    // Determine next state
    let newStatus = 'در انتظار';
    let newStep = stepIndex;

    if (req.body.decision === 'رد شده') {
      newStatus = 'رد شده';
    } else {
      // Move to next step if approved
      const nextStep = stepIndex + 1;
      if (nextStep >= steps.length) {
        newStatus = 'تأیید شده';
      } else {
        newStep = nextStep;
      }
    }

    const updated = await prisma.approvalInstance.update({
      where: { id: instance.id },
      data: { currentStep: newStep, status: newStatus, updatedAt: new Date() },
      include: { workflow: true, votes: { include: { user: { select: { id: true, fullName: true } } } } },
    });

    res.json({ instance: updated, vote });
  })
);

export default router;
