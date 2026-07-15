import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/hr behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });
const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Departments ──────────────────────────────────────────────────────────────
const deptSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });

router.get('/departments', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const departments = await prisma.hrDepartment.findMany({ where: { tenantId: tid(req) }, include: { _count: { select: { employees: true } } }, orderBy: { code: 'asc' } });
  res.json({ departments });
}));
router.post('/departments', requirePermission('hr.create'), validate(deptSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req); const b = req.body as z.infer<typeof deptSchema>;
  const dup = await prisma.hrDepartment.findFirst({ where: { tenantId, code: b.code.trim() } });
  if (dup) throw ApiError.conflict(`دپارتمان با کد «${b.code.trim()}» قبلاً ثبت شده است`);
  const department = await prisma.hrDepartment.create({ data: { tenantId, code: b.code.trim(), name: b.name.trim() } });
  res.status(201).json({ department });
}));
router.patch('/departments/:id', requirePermission('hr.edit'), validate(deptSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrDepartment.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('دپارتمان یافت نشد');
  const b = req.body as Partial<z.infer<typeof deptSchema>>;
  const department = await prisma.hrDepartment.update({ where: { id: existing.id }, data: { ...(b.name !== undefined ? { name: b.name.trim() } : {}) } });
  res.json({ department });
}));
router.delete('/departments/:id', requirePermission('hr.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrDepartment.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('دپارتمان یافت نشد');
  const used = await prisma.hrEmployee.count({ where: { tenantId, departmentId: existing.id } });
  if (used > 0) throw ApiError.badRequest('این دپارتمان دارای کارمند است و قابل حذف نیست');
  await prisma.hrDepartment.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Employees ────────────────────────────────────────────────────────────────
const empSchema = z.object({
  employeeCode: z.string().min(1),
  fullName: z.string().min(1),
  nationalId: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  employmentType: z.enum(['full_time', 'part_time', 'contract']).optional(),
  status: z.enum(['active', 'on_leave', 'terminated']).optional(),
  hireDate: z.coerce.date().optional().nullable(),
  baseSalary: z.coerce.number().min(0).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  annualLeaveEntitlement: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});

router.get('/employees', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const terms = searchTerms(req.query.search as string | undefined);
  const where: Prisma.HrEmployeeWhereInput = {
    tenantId,
    ...(req.query.departmentId ? { departmentId: req.query.departmentId as string } : {}),
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(terms.length ? { OR: terms.flatMap((v) => [
      { employeeCode: { contains: v, mode: 'insensitive' as const } },
      { fullName: { contains: v, mode: 'insensitive' as const } },
      { position: { contains: v, mode: 'insensitive' as const } },
    ]) } : {}),
  };
  const employees = await prisma.hrEmployee.findMany({ where, include: { department: { select: { name: true } } }, orderBy: { fullName: 'asc' }, take: 500 });
  res.json({ employees });
}));

router.post('/employees', requirePermission('hr.create'), validate(empSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req); const b = req.body as z.infer<typeof empSchema>;
  const dup = await prisma.hrEmployee.findFirst({ where: { tenantId, employeeCode: b.employeeCode.trim() } });
  if (dup) throw ApiError.conflict(`کارمند با کد «${b.employeeCode.trim()}» قبلاً ثبت شده است`);
  const employee = await prisma.hrEmployee.create({ data: { tenantId, ...b, employeeCode: b.employeeCode.trim(), fullName: b.fullName.trim(), createdById: req.auth!.userId } });
  res.status(201).json({ employee });
}));

router.patch('/employees/:id', requirePermission('hr.edit'), validate(empSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrEmployee.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('کارمند یافت نشد');
  const b = req.body as Partial<z.infer<typeof empSchema>>;
  const { employeeCode, ...rest } = b;
  const employee = await prisma.hrEmployee.update({ where: { id: existing.id }, data: rest });
  res.json({ employee });
}));

router.delete('/employees/:id', requirePermission('hr.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrEmployee.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('کارمند یافت نشد');
  await prisma.hrEmployee.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Leave requests ───────────────────────────────────────────────────────────
const leaveSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(['annual', 'sick', 'unpaid', 'mission', 'other']).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  days: z.coerce.number().positive(),
  reason: z.string().optional().nullable(),
});

router.get('/leaves', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const where: Prisma.HrLeaveRequestWhereInput = {
    tenantId: tid(req),
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(req.query.employeeId ? { employeeId: req.query.employeeId as string } : {}),
  };
  const leaves = await prisma.hrLeaveRequest.findMany({ where, include: { employee: { select: { fullName: true, employeeCode: true } } }, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ leaves });
}));

router.post('/leaves', requirePermission('hr.create'), validate(leaveSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req); const b = req.body as z.infer<typeof leaveSchema>;
  const emp = await prisma.hrEmployee.findFirst({ where: { tenantId, id: b.employeeId } });
  if (!emp) throw ApiError.badRequest('کارمند نامعتبر است');
  if (b.endDate < b.startDate) throw ApiError.badRequest('تاریخ پایان باید بعد از شروع باشد');
  const leave = await prisma.hrLeaveRequest.create({ data: { tenantId, employeeId: b.employeeId, type: b.type ?? 'annual', startDate: b.startDate, endDate: b.endDate, days: b.days, reason: b.reason ?? null, createdById: req.auth!.userId } });
  res.status(201).json({ leave });
}));

router.post('/leaves/:id/decide', requirePermission('hr.approve'), validate(z.object({ status: z.enum(['approved', 'rejected']) })), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrLeaveRequest.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('درخواست مرخصی یافت نشد');
  if (existing.status !== 'pending') throw ApiError.badRequest('این درخواست قبلاً بررسی شده است');
  const status = (req.body as { status: string }).status;
  const leave = await prisma.hrLeaveRequest.update({ where: { id: existing.id }, data: { status, decidedById: req.auth!.userId, decidedAt: new Date() } });
  res.json({ leave });
}));

router.delete('/leaves/:id', requirePermission('hr.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.hrLeaveRequest.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('درخواست مرخصی یافت نشد');
  await prisma.hrLeaveRequest.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

/** Per-employee annual-leave balance: entitlement − approved annual leave (year). */
router.get('/leave-balances', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const year = Number(req.query.year) || new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)), yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const [employees, grouped] = await Promise.all([
    prisma.hrEmployee.findMany({ where: { tenantId, status: { not: 'terminated' } }, select: { id: true, employeeCode: true, fullName: true, annualLeaveEntitlement: true } }),
    prisma.hrLeaveRequest.groupBy({ by: ['employeeId'], where: { tenantId, type: 'annual', status: 'approved', startDate: { gte: yearStart, lt: yearEnd } }, _sum: { days: true } }),
  ]);
  const used = new Map(grouped.map((g) => [g.employeeId, Number(g._sum.days ?? 0)]));
  const rows = employees.map((e) => { const u = round2(used.get(e.id) ?? 0); return { employeeId: e.id, employeeCode: e.employeeCode, fullName: e.fullName, entitlement: e.annualLeaveEntitlement, used: u, remaining: round2(e.annualLeaveEntitlement - u) }; });
  res.json({ year, rows });
}));

// ── Attendance ───────────────────────────────────────────────────────────────
const attendanceSchema = z.object({
  records: z.array(z.object({
    employeeId: z.string().min(1),
    date: z.coerce.date(),
    status: z.enum(['present', 'absent', 'leave', 'mission', 'holiday']),
    hours: z.coerce.number().min(0).max(24).optional().nullable(),
    note: z.string().optional().nullable(),
  })).min(1),
});

/** Attendance for a month range (from..to), optionally by employee. */
router.get('/attendance', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  const attendance = await prisma.hrAttendance.findMany({
    where: { tenantId, ...(req.query.employeeId ? { employeeId: req.query.employeeId as string } : {}), ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    orderBy: { date: 'asc' }, take: 2000,
  });
  res.json({ attendance });
}));

/** Bulk upsert attendance records (per employee+date). */
router.post('/attendance', requirePermission('hr.edit'), validate(attendanceSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const { records } = req.body as z.infer<typeof attendanceSchema>;
  await prisma.$transaction(records.map((r) => prisma.hrAttendance.upsert({
    where: { employeeId_date: { employeeId: r.employeeId, date: r.date } },
    create: { tenantId, employeeId: r.employeeId, date: r.date, status: r.status, hours: r.hours ?? null, note: r.note ?? null },
    update: { status: r.status, hours: r.hours ?? null, note: r.note ?? null },
  })));
  res.json({ ok: true, count: records.length });
}));

// ── Overview ─────────────────────────────────────────────────────────────────
router.get('/overview', requirePermission('hr.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const [total, active, onLeave, deptCount, pendingLeaves] = await Promise.all([
    prisma.hrEmployee.count({ where: { tenantId } }),
    prisma.hrEmployee.count({ where: { tenantId, status: 'active' } }),
    prisma.hrEmployee.count({ where: { tenantId, status: 'on_leave' } }),
    prisma.hrDepartment.count({ where: { tenantId } }),
    prisma.hrLeaveRequest.count({ where: { tenantId, status: 'pending' } }),
  ]);
  res.json({ total, active, onLeave, deptCount, pendingLeaves });
}));

export default router;
