export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: string;
  permission: string;
}

export interface NavGroup {
  key: string;
  title: string;
  /** Which platform module (app) this group belongs to. The shell shows only the
   *  active module's groups, so each app has its own personalised menu. */
  module: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: 'main',
    title: 'اصلی',
    module: 'procurement',
    items: [
      { key: 'dashboard', path: '/dashboard', label: 'داشبورد', icon: '🏠', permission: 'dashboard.view' },
      { key: 'controlCenter', path: '/control-center', label: 'مرکز کنترل', icon: '🎯', permission: 'control_center.view' },
      { key: 'notifications', path: '/notifications', label: 'مرکز هشدارها', icon: '🔔', permission: 'notification_center.view' },
    ],
  },
  {
    key: 'procurement',
    title: 'خرید',
    module: 'procurement',
    items: [
      { key: 'requests', path: '/requests', label: 'درخواست‌های فعال', icon: '📋', permission: 'requests.view' },
      { key: 'requestArchive', path: '/requests/archive', label: 'آرشیو درخواست‌ها', icon: '🗄️', permission: 'request_archive.view' },
      { key: 'quotations', path: '/quotations', label: 'پیش‌فاکتورهای فعال', icon: '📝', permission: 'quotations.view' },
      { key: 'quotationArchive', path: '/quotations/archive', label: 'آرشیو پیش‌فاکتورها', icon: '🗄️', permission: 'quotation_archive.view' },
      { key: 'gantt', path: '/gantt', label: 'گانت فرآیند خرید', icon: '📅', permission: 'requests.view' },
    ],
  },
  {
    key: 'budget',
    title: 'بودجه',
    module: 'procurement',
    items: [
      { key: 'budgets', path: '/budget', label: 'بودجه ماهانه و پیش‌بینی', icon: '💰', permission: 'monthly_budget.view' },
    ],
  },
  {
    key: 'finance',
    title: 'مالی',
    module: 'procurement',
    items: [
      { key: 'invoices', path: '/invoices', label: 'فاکتورها', icon: '🧾', permission: 'invoices.view' },
      { key: 'paidArchive', path: '/invoices/paid', label: 'آرشیو پرداخت شده', icon: '✅', permission: 'paid_invoice_archive.view' },
      { key: 'payments', path: '/payments', label: 'پرداخت‌ها', icon: '💳', permission: 'payments.view' },
    ],
  },
  {
    key: 'tasks',
    title: 'وظایف',
    module: 'procurement',
    items: [
      { key: 'taskList', path: '/tasks', label: 'وظایف و پیگیری', icon: '☑', permission: 'tasks.view' },
      { key: 'correspondence', path: '/correspondence', label: 'مکاتبات اداری', icon: '✉️', permission: 'correspondence.view' },
      { key: 'expenses', path: '/expenses', label: 'گزارش‌های هزینه', icon: '💸', permission: 'expenses.view' },
      { key: 'timeline', path: '/timeline', label: 'تاریخچه فعالیت‌ها', icon: '📜', permission: 'activity_timeline.view' },
    ],
  },
  {
    key: 'reports',
    title: 'گزارش',
    module: 'procurement',
    items: [
      { key: 'suppliers', path: '/suppliers', label: 'تأمین‌کنندگان', icon: '🏭', permission: 'suppliers.view' },
      { key: 'supplierStatement', path: '/suppliers/statement', label: 'صورت‌حساب تأمین‌کننده', icon: '📊', permission: 'supplier_statement.view' },
      { key: 'documents', path: '/documents', label: 'مرکز اسناد', icon: '📁', permission: 'document_center.view' },
      { key: 'dueDates', path: '/due-dates', label: 'پایش سررسید', icon: '⏰', permission: 'due_dates.view' },
      { key: 'reports', path: '/reports', label: 'گزارش‌ها و KPI', icon: '📈', permission: 'reports.view' },
      { key: 'executive', path: '/executive', label: 'داشبورد مدیریتی', icon: '👨‍💼', permission: 'executive_dashboard.view' },
      { key: 'analytics', path: '/analytics', label: 'تحلیل و پیش‌بینی', icon: '📉', permission: 'analytics_forecast.view' },
      { key: 'importExport', path: '/import-export', label: 'ورود / خروج داده', icon: '🔄', permission: 'import_export.view' },
      { key: 'audit', path: '/audit', label: 'اعتبارسنجی ERP', icon: '🛡️', permission: 'erp_audit.view' },
    ],
  },
  {
    key: 'warehouse',
    title: 'انبار',
    module: 'warehouse',
    items: [
      { key: 'invStock', path: '/inventory/stock', label: 'موجودی انبار', icon: '📦', permission: 'warehouse.view' },
      { key: 'invReceipts', path: '/inventory/receipts', label: 'رسیدهای در انتظار', icon: '📥', permission: 'warehouse.receive' },
      { key: 'invProducts', path: '/inventory/products', label: 'کالاها', icon: '🏷️', permission: 'warehouse.view' },
      { key: 'invWarehouses', path: '/inventory/warehouses', label: 'انبارها', icon: '🏬', permission: 'warehouse.view' },
    ],
  },
  {
    key: 'management',
    title: 'مدیریت',
    module: 'system',
    items: [
      { key: 'approvals', path: '/approvals', label: 'گردش‌کارهای تأیید', icon: '✅', permission: 'approvals.view' },
      { key: 'subscription', path: '/subscription', label: 'اشتراک و پلن', icon: '💎', permission: 'billing.view' },
      { key: 'users', path: '/users', label: 'کاربران و دسترسی', icon: '👥', permission: 'user_management.view' },
      { key: 'tenants', path: '/tenants', label: 'مدیریت سازمان‌ها', icon: '🏢', permission: 'user_management.manage_users' },
      { key: 'profile', path: '/profile', label: 'پروفایل کاربری', icon: '👤', permission: 'dashboard.view' },
    ],
  },
];

/**
 * The module (app) that owns a given route, by longest matching nav path.
 * Returns null for the Hub ('/'), so the shell shows no module menu there.
 * Falls back to 'procurement' for any unmapped in-app route.
 */
export function moduleForPath(pathname: string): string | null {
  if (pathname === '/') return null;
  let match: string | null = null;
  let matchLen = -1;
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.path === '/') continue;
      const hit = pathname === item.path || pathname.startsWith(item.path + '/');
      if (hit && item.path.length > matchLen) {
        match = group.module;
        matchLen = item.path.length;
      }
    }
  }
  return match ?? 'procurement';
}
