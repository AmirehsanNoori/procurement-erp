/**
 * Central permission catalog — the single source of truth for modules, actions,
 * permission keys, and role defaults. Used by both the seed script and runtime checks.
 *
 * A permission key has the form `<module>.<action>`, e.g. "requests.create".
 */

export const MODULES = {
  dashboard: 'dashboard',
  control_center: 'control_center',
  notification_center: 'notification_center',
  requests: 'requests',
  request_archive: 'request_archive',
  quotations: 'quotations',
  quotation_archive: 'quotation_archive',
  monthly_budget: 'monthly_budget',
  invoices: 'invoices',
  paid_invoice_archive: 'paid_invoice_archive',
  payments: 'payments',
  tasks: 'tasks',
  activity_timeline: 'activity_timeline',
  suppliers: 'suppliers',
  supplier_statement: 'supplier_statement',
  document_center: 'document_center',
  due_dates: 'due_dates',
  reports: 'reports',
  executive_dashboard: 'executive_dashboard',
  analytics_forecast: 'analytics_forecast',
  import_export: 'import_export',
  erp_audit: 'erp_audit',
  user_management: 'user_management',
  approvals: 'approvals',
  correspondence: 'correspondence',
  expenses: 'expenses',
  billing: 'billing',
} as const;

export type ModuleKey = keyof typeof MODULES;

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'archive',
  'restore',
  'import',
  'export',
  'approve',
  'assign_budget',
  'register_payment',
  'upload_document',
  'view_document',
  'delete_document',
  'manage_users',
  'run_audit',
  'manage',
  'request',
  'vote',
] as const;

export type ActionKey = (typeof ACTIONS)[number];

/**
 * Which actions are meaningful for each module. Keeping this explicit avoids
 * generating nonsensical permissions (e.g. "dashboard.register_payment").
 */
export const MODULE_ACTIONS: Record<ModuleKey, ActionKey[]> = {
  dashboard: ['view', 'export'],
  control_center: ['view', 'edit', 'import', 'export'],
  notification_center: ['view', 'export'],
  requests: ['view', 'create', 'edit', 'delete', 'archive', 'restore', 'import', 'export'],
  request_archive: ['view', 'restore', 'export'],
  quotations: ['view', 'create', 'edit', 'delete', 'archive', 'restore', 'approve', 'export'],
  quotation_archive: ['view', 'restore', 'export'],
  monthly_budget: ['view', 'create', 'edit', 'delete', 'approve', 'assign_budget', 'export'],
  invoices: ['view', 'create', 'edit', 'delete', 'archive', 'approve', 'assign_budget', 'export'],
  paid_invoice_archive: ['view', 'export'],
  payments: ['view', 'create', 'edit', 'delete', 'register_payment', 'export'],
  tasks: ['view', 'create', 'edit', 'delete', 'archive', 'export'],
  activity_timeline: ['view', 'export'],
  suppliers: ['view', 'create', 'edit', 'delete', 'export'],
  supplier_statement: ['view', 'export'],
  document_center: ['view', 'upload_document', 'view_document', 'delete_document', 'export'],
  due_dates: ['view', 'export'],
  reports: ['view', 'export'],
  executive_dashboard: ['view', 'export'],
  analytics_forecast: ['view', 'export'],
  import_export: ['view', 'import', 'export'],
  erp_audit: ['view', 'run_audit', 'export'],
  user_management: ['view', 'create', 'edit', 'delete', 'manage_users'],
  approvals: ['view', 'manage', 'request', 'vote'],
  correspondence: ['view', 'create', 'edit', 'delete', 'export'],
  expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  billing: ['view', 'manage'],
};

export interface PermissionDef {
  key: string;
  module: ModuleKey;
  action: ActionKey;
  description: string;
}

const ACTION_FA: Record<ActionKey, string> = {
  view: 'مشاهده',
  create: 'ایجاد',
  edit: 'ویرایش',
  delete: 'حذف',
  archive: 'بایگانی',
  restore: 'بازیابی',
  import: 'ورود',
  export: 'خروج',
  approve: 'تأیید',
  assign_budget: 'تخصیص بودجه',
  register_payment: 'ثبت پرداخت',
  upload_document: 'بارگذاری سند',
  view_document: 'مشاهده سند',
  delete_document: 'حذف سند',
  manage_users: 'مدیریت کاربران',
  run_audit: 'اجرای اعتبارسنجی',
  manage: 'مدیریت',
  request: 'درخواست تأیید',
  vote: 'رأی‌گیری',
};

export const MODULE_FA: Record<ModuleKey, string> = {
  dashboard: 'داشبورد',
  control_center: 'مرکز کنترل',
  notification_center: 'مرکز هشدارها',
  requests: 'درخواست‌ها',
  request_archive: 'آرشیو درخواست‌ها',
  quotations: 'پیش‌فاکتورها',
  quotation_archive: 'آرشیو پیش‌فاکتورها',
  monthly_budget: 'بودجه ماهانه',
  invoices: 'فاکتورها',
  paid_invoice_archive: 'آرشیو پرداخت‌شده',
  payments: 'پرداخت‌ها',
  tasks: 'وظایف',
  activity_timeline: 'تاریخچه فعالیت‌ها',
  suppliers: 'تأمین‌کنندگان',
  supplier_statement: 'صورت‌حساب تأمین‌کننده',
  document_center: 'مرکز اسناد',
  due_dates: 'پایش سررسید',
  reports: 'گزارش‌ها و KPI',
  executive_dashboard: 'داشبورد مدیریتی',
  analytics_forecast: 'تحلیل و پیش‌بینی',
  import_export: 'ورود / خروج داده',
  erp_audit: 'اعتبارسنجی ERP',
  user_management: 'مدیریت کاربران و دسترسی',
  approvals: 'گردش‌کارهای تأیید',
  correspondence: 'مکاتبات اداری',
  expenses: 'گزارش‌های هزینه',
  billing: 'اشتراک و صورت‌حساب',
};

/** Flat list of all permission definitions, derived from MODULE_ACTIONS. */
export const ALL_PERMISSIONS: PermissionDef[] = (
  Object.keys(MODULE_ACTIONS) as ModuleKey[]
).flatMap((module) =>
  MODULE_ACTIONS[module].map((action) => ({
    key: `${module}.${action}`,
    module,
    action,
    description: `${MODULE_FA[module]} — ${ACTION_FA[action]}`,
  }))
);

export const ALL_PERMISSION_KEYS: string[] = ALL_PERMISSIONS.map((p) => p.key);

// ────────────────────────────────────────────────
// Role names + default permission matrices (spec §5)
// ────────────────────────────────────────────────

export const ROLES = {
  PROCUREMENT_MANAGER: 'Procurement Manager',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  WAREHOUSE: 'Warehouse',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** Helper: every action available on a set of modules. */
function allOf(modules: ModuleKey[]): string[] {
  return modules.flatMap((m) => MODULE_ACTIONS[m].map((a) => `${m}.${a}`));
}

/** Helper: explicit subset of actions for a module. */
function some(module: ModuleKey, actions: ActionKey[]): string[] {
  return actions
    .filter((a) => MODULE_ACTIONS[module].includes(a))
    .map((a) => `${module}.${a}`);
}

/**
 * Procurement Manager: full access to everything.
 */
const MANAGER_PERMISSIONS = ALL_PERMISSION_KEYS;

/**
 * Procurement Officer (spec §5):
 * - Dashboard: view
 * - Control Center: view/edit operational fields
 * - Requests / Quotations / Invoices / Suppliers: full
 * - Supplier Statement: view
 * - Document Center: upload/view
 * - Timeline / Notifications: view
 * - Reports: view/export (limited)
 * - Monthly Budget: view only; Payments: view only
 * - Executive / Analytics / Audit / User mgmt: none
 */
const OFFICER_PERMISSIONS = [
  ...some('dashboard', ['view', 'export']),
  ...some('control_center', ['view', 'edit', 'import', 'export']),
  ...some('notification_center', ['view']),
  ...allOf(['requests', 'request_archive', 'quotations', 'quotation_archive']),
  ...allOf(['invoices', 'paid_invoice_archive']),
  ...allOf(['suppliers']),
  ...some('supplier_statement', ['view', 'export']),
  ...some('monthly_budget', ['view']),
  ...some('payments', ['view']),
  ...some('tasks', ['view', 'create', 'edit', 'delete']),
  ...some('activity_timeline', ['view']),
  ...some('document_center', ['view', 'upload_document', 'view_document']),
  ...some('due_dates', ['view']),
  ...some('reports', ['view', 'export']),
  ...some('import_export', ['view', 'export']),
];

/**
 * Warehouse (spec §5): control center delivery fields, requests view,
 * delivery-related document upload/view, delivery notifications.
 */
const WAREHOUSE_PERMISSIONS = [
  ...some('control_center', ['view', 'edit']),
  ...some('requests', ['view', 'edit']),
  ...some('notification_center', ['view']),
  ...some('document_center', ['view', 'upload_document', 'view_document']),
  ...some('tasks', ['view']),
];

export const ROLE_DEFAULTS: Record<RoleName, string[]> = {
  [ROLES.PROCUREMENT_MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.PROCUREMENT_OFFICER]: Array.from(new Set(OFFICER_PERMISSIONS)),
  [ROLES.WAREHOUSE]: Array.from(new Set(WAREHOUSE_PERMISSIONS)),
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  [ROLES.PROCUREMENT_MANAGER]: 'دسترسی کامل به همه ماژول‌ها و عملیات',
  [ROLES.PROCUREMENT_OFFICER]: 'دسترسی عملیاتی به خرید، فاکتور و تأمین‌کنندگان',
  [ROLES.WAREHOUSE]: 'دسترسی محدود به فیلدهای تحویل و انبار',
};
