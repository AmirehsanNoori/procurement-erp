import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, RequirePermission } from './components/guards';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Requests } from './pages/Requests';
import { Users } from './pages/Users';
import { Suppliers } from './pages/Suppliers';
import { Budgets } from './pages/Budgets';
import { Quotations } from './pages/Quotations';
import { Invoices } from './pages/Invoices';
import { Payments } from './pages/Payments';
import { ControlCenter } from './pages/ControlCenter';
import { Documents } from './pages/Documents';
import { Notifications } from './pages/Notifications';
import { Executive } from './pages/Executive';
import { Audit } from './pages/Audit';
import { ImportExport } from './pages/ImportExport';
import { DueDates } from './pages/DueDates';
import { SupplierStatement } from './pages/SupplierStatement';
import { Reports } from './pages/Reports';
import { Tasks } from './pages/Tasks';
import { Timeline } from './pages/Timeline';
import { Analytics } from './pages/Analytics';
import { Profile } from './pages/Profile';
import { Tenants } from './pages/Tenants';
import { Approvals } from './pages/Approvals';
import { RFQCompare } from './pages/RFQCompare';
import { Correspondence } from './pages/Correspondence';
import { GanttView } from './pages/GanttView';
import { Expenses } from './pages/Expenses';
import { Subscription } from './pages/Subscription';

function Guarded({ permission, children }: { permission: string; children: ReactNode }) {
  return (
    <ProtectedRoute>
      <RequirePermission permission={permission}>{children}</RequirePermission>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guarded permission="dashboard.view"><Dashboard /></Guarded>} />

        {/* Requests */}
        <Route path="/rfq-compare" element={<Guarded permission="quotations.view"><RFQCompare /></Guarded>} />
        <Route path="/requests" element={<Guarded permission="requests.view"><Requests /></Guarded>} />
        <Route path="/requests/archive" element={<Guarded permission="request_archive.view"><Requests archived /></Guarded>} />

        {/* Suppliers */}
        <Route path="/suppliers" element={<Guarded permission="suppliers.view"><Suppliers /></Guarded>} />
        <Route path="/suppliers/statement" element={<Guarded permission="supplier_statement.view"><SupplierStatement /></Guarded>} />

        {/* Finance */}
        <Route path="/budget" element={<Guarded permission="monthly_budget.view"><Budgets /></Guarded>} />
        <Route path="/quotations" element={<Guarded permission="quotations.view"><Quotations /></Guarded>} />
        <Route path="/quotations/archive" element={<Guarded permission="quotation_archive.view"><Quotations archived /></Guarded>} />
        <Route path="/invoices" element={<Guarded permission="invoices.view"><Invoices /></Guarded>} />
        <Route path="/invoices/paid" element={<Guarded permission="paid_invoice_archive.view"><Invoices paidOnly /></Guarded>} />
        <Route path="/payments" element={<Guarded permission="payments.view"><Payments /></Guarded>} />

        {/* Operations */}
        <Route path="/control-center" element={<Guarded permission="control_center.view"><ControlCenter /></Guarded>} />
        <Route path="/documents" element={<Guarded permission="document_center.view"><Documents /></Guarded>} />
        <Route path="/tasks" element={<Guarded permission="tasks.view"><Tasks /></Guarded>} />
        <Route path="/due-dates" element={<Guarded permission="due_dates.view"><DueDates /></Guarded>} />
        <Route path="/timeline" element={<Guarded permission="activity_timeline.view"><Timeline /></Guarded>} />

        {/* Intelligence */}
        <Route path="/notifications" element={<Guarded permission="notification_center.view"><Notifications /></Guarded>} />
        <Route path="/executive" element={<Guarded permission="executive_dashboard.view"><Executive /></Guarded>} />
        <Route path="/reports" element={<Guarded permission="reports.view"><Reports /></Guarded>} />
        <Route path="/analytics" element={<Guarded permission="analytics_forecast.view"><Analytics /></Guarded>} />

        {/* Correspondence */}
        <Route path="/correspondence" element={<Guarded permission="correspondence.view"><Correspondence /></Guarded>} />
        <Route path="/gantt" element={<Guarded permission="requests.view"><GanttView /></Guarded>} />
        <Route path="/expenses" element={<Guarded permission="expenses.view"><Expenses /></Guarded>} />

        {/* System */}
        <Route path="/import-export" element={<Guarded permission="import_export.view"><ImportExport /></Guarded>} />
        <Route path="/audit" element={<Guarded permission="erp_audit.view"><Audit /></Guarded>} />
        <Route path="/approvals" element={<Guarded permission="approvals.view"><Approvals /></Guarded>} />
        <Route path="/subscription" element={<Guarded permission="billing.view"><Subscription /></Guarded>} />
        <Route path="/users" element={<Guarded permission="user_management.view"><Users /></Guarded>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
