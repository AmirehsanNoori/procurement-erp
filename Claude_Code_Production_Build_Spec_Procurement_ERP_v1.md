# Procurement ERP Production Build Specification
## Product: Multi-Tenant Procurement ERP Dashboard
## Version Target: Production v1.0
## Prototype Reference: Procurement ERP Dashboard V3.2

---

# 0. CRITICAL INSTRUCTION FOR CLAUDE CODE

You must build the production version of the existing Procurement ERP Dashboard exactly based on the current functional prototype.

Do NOT redesign the product concept.
Do NOT remove features.
Do NOT simplify workflows.
Do NOT replace business logic with generic ERP assumptions.
Do NOT rebuild blindly from scratch without understanding the prototype.

Use the provided HTML prototype as the functional reference for:
- UI structure
- modules
- workflows
- statuses
- calculations
- Persian calendar behavior
- Excel import/export format
- dashboard logic
- notifications
- audit
- analytics
- document center
- control center

The goal is to convert the current single-file IndexedDB prototype into a real production web application with:
- backend
- database
- authentication
- multi-tenant architecture
- role-based access control
- file storage
- deployment readiness

The final product must behave like the current prototype, but with real server-side persistence, users, permissions, tenants, and production deployment.

---

# 1. Product Vision

Build a real Procurement ERP system for procurement, budget control, invoice tracking, supplier management, document management, payment planning, notifications, analytics, and management reporting.

The system will initially support two operational tenants:

1. IOID-WPA
2. SOPID-CMK

Each tenant must have separate data, separate users, separate records, and separate permissions.

The application should allow the admin/procurement manager to define users, assign them to one or more tenants, assign roles, and control exactly which modules/actions each user can access.

The system must be Persian-first:
- RTL layout
- Persian labels
- Persian calendar / Jalali dates
- Persian Excel exports where applicable
- Persian operational terminology

---

# 2. Initial Tenants

The production system must include support for the following tenants:

## Tenant 1
Name: IOID-WPA

## Tenant 2
Name: SOPID-CMK

Each record must belong to exactly one tenant.

Users may have access to one or more tenants.

A user’s role and permissions may differ per tenant.

Example:
- User A may be Procurement Manager in IOID-WPA.
- User A may be Viewer or no-access in SOPID-CMK.
- User B may be Warehouse in SOPID-CMK only.

Tenant isolation is mandatory.

Users must never see records from tenants they do not have access to.

---

# 3. Roles

Initial roles:

1. Procurement Manager
2. Procurement Officer
3. Warehouse

The system must also allow custom permission editing per user.

Roles provide defaults, but the admin must be able to override permissions per user.

---

# 4. Permission System

Access control must work at two levels:

## 4.1 Module Level

For each user and tenant, define whether they can access:

- Dashboard
- Control Center
- Notification Center
- Requests
- Request Archive
- Quotations / Pre-Invoices
- Quotation Archive
- Monthly Budget
- Invoices
- Paid Invoice Archive
- Payments
- Tasks
- Activity Timeline
- Suppliers
- Supplier Statement
- Document Center
- Due Dates
- Reports & KPI
- Executive Dashboard
- Analytics & Forecast
- Import / Export
- ERP Audit
- User & Access Management

## 4.2 Action Level

For each module, define actions:

- view
- create
- edit
- delete
- archive
- restore
- import
- export
- approve
- assign_budget
- register_payment
- upload_document
- view_document
- delete_document
- manage_users
- run_audit

The UI must hide modules the user cannot view.

The UI must hide buttons/actions the user cannot perform.

Backend APIs must also enforce permissions. Hiding UI alone is not enough.

---

# 5. Default Permission Matrix

## Procurement Manager

Full access to all modules and all actions.

Can:
- manage users
- manage tenants
- view all dashboards
- create/edit/delete records
- approve budgets
- register payments
- import/export Excel
- run audit
- access analytics
- access executive dashboard

## Procurement Officer

Can access:

- Dashboard: view
- Control Center: view/edit operational fields
- Requests: full
- Quotations / Pre-Invoices: full
- Invoices: full
- Suppliers: full
- Supplier Statement: view
- Document Center: upload/view
- Timeline: view
- Notifications: view
- Reports: view/export limited

Limitations:
- Monthly Budget: view only
- Payments: view only
- Executive Dashboard: no access by default
- Analytics: no access by default
- ERP Audit: no access
- User Management: no access

## Warehouse

Can access:

- Control Center: view/edit delivery-related fields only
- Requests: view
- Delivery Status: edit
- Received Date: edit
- Received Percentage: edit
- Documents: upload/view delivery documents
- Notifications: view delivery-related alerts

Limitations:
- Quotations: no access
- Budget: no access
- Invoices: no access
- Payments: no access
- Suppliers: no access
- Supplier Statement: no access
- Executive Dashboard: no access
- Analytics: no access
- ERP Audit: no access
- User Management: no access

---

# 6. Required Admin/User Management Page

Add a production page:

## User & Access Management

This page must allow an authorized Procurement Manager/Admin to:

- create users
- edit users
- deactivate users
- assign users to tenants
- assign role per tenant
- override module permissions per user
- override action permissions per user
- reset password or invite user
- view last login
- view active/inactive status

Fields:

- full_name
- email
- password / invite flow
- phone optional
- status: active / inactive
- tenant access list
- role per tenant
- permission overrides
- created_at
- updated_at

---

# 7. Recommended Tech Stack

Use a modern, maintainable stack suitable for VPS deployment.

Recommended:

## Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- RTL support
- React Router
- TanStack Query
- Chart.js or Recharts
- Persian/Jalali date picker

## Backend
- Node.js
- Express or NestJS
- TypeScript
- REST API

## Database
- PostgreSQL

## ORM
- Prisma

## Authentication
- JWT access token + refresh token
- bcrypt password hashing
- server-side permission checks

## File Storage
Initial VPS local storage:
- /uploads/{tenant_id}/...

Future-ready abstraction for S3-compatible storage.

## Deployment
- Ubuntu VPS
- Nginx reverse proxy
- PM2 or Docker Compose
- SSL via Certbot
- PostgreSQL on same VPS initially
- Daily backups

---

# 8. Database Design

All operational tables must include:

- id
- tenant_id
- created_by
- updated_by
- created_at
- updated_at

Important tables:

## tenants
- id
- name
- code
- is_active
- created_at
- updated_at

Initial records:
- IOID-WPA
- SOPID-CMK

## users
- id
- full_name
- email
- password_hash
- phone
- is_active
- created_at
- updated_at

## tenant_users
- id
- tenant_id
- user_id
- role_id
- is_active

## roles
- id
- name
- description

Initial roles:
- Procurement Manager
- Procurement Officer
- Warehouse

## permissions
- id
- key
- module
- action
- description

## role_permissions
- id
- role_id
- permission_id

## user_permission_overrides
- id
- tenant_id
- user_id
- permission_id
- allowed boolean

---

# 9. Core Business Tables

## requests
Represents purchase requests.

Fields:
- id
- tenant_id
- request_number / quote_no / pq
- order_no
- title
- description
- category
- request_date
- document_date
- received_date
- weekly_segmentation
- received_percentage
- estimated_amount
- supplier_id nullable
- status
- follow_up_date
- delivery_date
- service_date
- driver
- service_provider
- notes
- ioid_row
- ioid_remark
- archived

## quotations / pre_invoices
- id
- tenant_id
- request_id
- quotation_number
- supplier_id
- date
- amount
- currency
- status
- budget_id
- follow_up_date
- delivery_date
- advance_payment_amount
- advance_payment_date
- payment_batch_number
- accounting_reference
- notes
- archived

## budgets
Unified monthly budget model.

Fields:
- id
- tenant_id
- name
- year_jalali
- month_jalali
- estimated_cost
- contingency_percent
- required_budget
- approved_budget
- manual_actual
- variance_reason
- notes

## budget_allocations
- id
- tenant_id
- budget_id
- year_jalali
- month_jalali
- percentage
- amount

## invoices
- id
- tenant_id
- invoice_number
- request_id
- quotation_id
- supplier_id
- invoice_date
- due_date
- total_amount
- status
- budget_id
- batch
- accounting_reference
- accounting_notes
- sent_to_accounting boolean
- accounting_submission_date
- notes
- archived

## installments
- id
- tenant_id
- invoice_id
- amount
- due_date
- status
- notes

## payments
- id
- tenant_id
- invoice_id
- payment_date
- amount
- payment_list_number
- reference
- notes

## suppliers
- id
- tenant_id
- name
- contact_person
- phone
- email
- bank_account
- notes

## documents
- id
- tenant_id
- entity_type
- entity_id
- category
- filename
- original_filename
- mime_type
- size
- storage_path
- uploaded_by
- created_at

## tasks
- id
- tenant_id
- title
- description
- priority
- due_date
- follow_up_date
- status
- related_request_id
- related_invoice_id
- assigned_to
- archived

## timeline_events
- id
- tenant_id
- entity_type
- entity_id
- event_type
- event_date
- user_id
- notes
- reference

## notifications
Notifications can be calculated dynamically or stored.
If stored:
- id
- tenant_id
- type
- level
- title
- description
- entity_type
- entity_id
- is_read
- created_at

---

# 10. Required Modules / Pages

The production app must include all current prototype modules:

1. Dashboard
2. Control Center
3. Notification Center
4. Active Requests
5. Request Archive
6. Active Quotations / Pre-Invoices
7. Quotation Archive
8. Monthly Budget & Forecast Unified
9. Invoices
10. Paid Invoice Archive
11. Payments
12. Tasks & Follow-up
13. Activity Timeline
14. Suppliers
15. Supplier Statement
16. Document Center
17. Due Date Monitoring
18. Reports & KPI
19. Executive Dashboard
20. Analytics & Forecast
21. Import / Export
22. ERP Audit
23. User & Access Management
24. Tenant Switcher

---

# 11. Tenant Switcher

The app must include a tenant switcher in the topbar.

If a user has access to one tenant only:
- automatically select that tenant
- hide or disable tenant switcher

If a user has access to multiple tenants:
- allow switching between IOID-WPA and SOPID-CMK
- reload all data based on selected tenant

Every API request must include selected tenant context and backend must verify access.

---

# 12. Control Center — IOID Excel Format

This is mandatory.

The Control Center must match the IOID Excel format exactly.

Columns:

1. ROW
2. QUOTE NO
3. ORDER NO
4. TITLE
5. CATEGORY
6. DOCUMENT DATE
7. RECEIVED DATE
8. WEEKLY SEGMANTATION ( SEGM - MONTH )
9. RECEIVED PERCENTAGE
10. COST
11. REMARK
12. PAYMENT STATUS

The system must support:

- Import from Excel using this format
- Export to Excel using this exact format
- Preserve column order
- Preserve values as much as possible
- Match rows by QUOTE NO
- If QUOTE NO exists: update existing request
- If QUOTE NO does not exist: create new request
- Add / update PAYMENT STATUS based on linked invoice/payment records

Warehouse users must be able to update:
- RECEIVED DATE
- RECEIVED PERCENTAGE
- REMARK
- Delivery-related fields only

---

# 13. Search Requirement

Every major module must support search by Request Number / QUOTE NO / PQ.

Modules:

- Dashboard global search
- Control Center
- Requests
- Quotations
- Invoices
- Payments
- Budget
- Supplier Statement
- Document Center
- Timeline
- Reports
- Analytics where relevant

---

# 14. Status Requirements

The following statuses must be supported where relevant.

Existing statuses from prototype must remain.

Additional statuses:

- سفارش داده شده
- تحویل شده
- کنسل شده
- در حال تعمیر یا بررسی توسط ورکشاپ
- در انتظار پیش فاکتور
- در انتظار فاکتور
- در انتظار اطلاعات بیشتر

Status availability should be module-appropriate:

## Request
- جدید
- در بررسی
- تأیید شده
- سفارش داده شده
- تحویل شده
- کنسل شده
- در حال تعمیر یا بررسی توسط ورکشاپ
- در انتظار پیش فاکتور
- در انتظار اطلاعات بیشتر

## Quotation / Pre-Invoice
- در انتظار سفارش
- سفارش داده شده
- کالا ارسال شده
- کالا تحویل داده شده
- در انتظار فاکتور
- تبدیل شده
- کنسل شده
- در انتظار اطلاعات بیشتر

## Invoice
- در انتظار بودجه
- در انتظار تأیید
- آماده پرداخت
- نیمه پرداخت
- پرداخت کامل
- در انتظار اطلاعات بیشتر
- کنسل شده

---

# 15. Monthly Payment Planning

The system must allow the user to see for each month:

- total amount payable
- invoices due in that month
- pre-invoices with advance payments or expected payment in that month
- installments due in that month
- payments already made in that month
- remaining payable amount
- budget linked to that month
- supplier breakdown

This must be visible in:
- Monthly Budget
- Payments
- Reports
- Executive Dashboard
- Analytics & Forecast

---

# 16. Document Center Requirements

Documents must be viewable inside the application.

Supported preview:
- images: jpg, jpeg, png, webp
- PDFs: embedded PDF viewer / iframe / browser PDF display

Supported download:
- Excel
- Word
- other file types

Each document must be linked to:
- request
- quotation
- invoice
- budget
- supplier
- payment if needed

Document categories:
- قرارداد
- فاکتور
- پیش‌فاکتور
- حسابداری
- تحویل
- نامه
- سایر

Access to documents must follow permissions.

Warehouse users can upload and view only delivery-related documents unless permissions are expanded.

---

# 17. Budget Rules

Use unified monthly budget model only.

There must not be two separate workflows for forecast and budget.

Budget fields:
- estimated cost
- contingency percent
- required budget
- approved budget
- monthly distribution
- reserved amount
- actual cost
- remaining balance

Formula:

Required Budget = Estimated Cost + (Estimated Cost × Contingency Percent)

Remaining Budget = Approved Budget - Reserved Amount - Actual Cost

All financial modules must synchronize:
- quotation
- advance payment
- invoice
- installments
- payment
- dashboard
- reports
- analytics

---

# 18. Payment Rules

Payments may be:
- advance payment from quotation
- invoice payment
- installment payment

Payment must update:
- invoice status
- budget actual cost
- supplier statement
- dashboard KPI
- payment schedule
- notifications
- timeline

Invoice statuses:
- no payment: آماده پرداخت / در انتظار پرداخت
- partial payment: نیمه پرداخت
- fully paid: پرداخت کامل

---

# 19. Notification Engine

Must generate alerts for:

Critical:
- overdue payment
- overdue invoice
- negative budget
- overdue task

Important:
- budget near limit
- request follow-up overdue
- quotation follow-up overdue
- invoice without budget
- invoice ready for payment
- high priority task

Info:
- top supplier debt
- upcoming payments
- upcoming due dates

Notifications must be tenant-aware and permission-aware.

---

# 20. Analytics & Forecast

Must include:

- Cost Trend Analysis
- Budget Accuracy
- Supplier Performance Score
- Forecast Engine for 1 / 3 / 6 months
- Procurement Analytics
- Executive Insights

All data must be filtered by selected tenant.

---

# 21. Executive Dashboard

Must include:

- total open debt
- approved budget
- actual + reserved
- remaining budget
- overdue cash requirement
- supplier with highest debt
- supplier debt chart
- budget performance chart
- top suppliers
- cash requirement forecast
- budget burn rate

Visible by default only to Procurement Manager.

---

# 22. ERP Audit

The system must include a final audit module that validates:

- workflow relationships
- missing references
- orphan records
- invalid budget links
- payment consistency
- invoice status consistency
- document links
- timeline events
- notifications engine
- Persian date conversion
- tenant isolation
- permission coverage

Audit result should show:
- errors
- warnings
- auto-fixable items
- production readiness status

---

# 23. Persian Calendar

The system must use Jalali dates in UI.

Internally, the backend may store ISO Gregorian dates for consistency, but must always display Persian/Jalali dates to users.

Requirements:
- no one-day offset bugs
- selected date must equal stored/displayed date
- filters must support Jalali UI
- Excel export should show Jalali dates where operationally expected

---

# 24. Excel Import / Export

Must support:

- IOID Control Center import/export
- reports export
- audit export
- analytics export
- executive dashboard export
- supplier statement export
- requests export
- quotations export
- invoices export
- payments export
- document index export

For IOID Control Center, the exact Excel format is mandatory.

---

# 25. File Migration

Current prototype stores attachments in IndexedDB as Base64.

Production version must store files in server storage.

Migration plan:
- during import/migration, decode Base64 if available
- save file to server storage
- create document record in database
- link document to entity

---

# 26. API Requirements

All APIs must be tenant-aware.

Example routes:

## Auth
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh
- GET /api/auth/me

## Tenants
- GET /api/tenants
- POST /api/tenants
- PATCH /api/tenants/:id

## Users / Access
- GET /api/users
- POST /api/users
- PATCH /api/users/:id
- POST /api/users/:id/tenants
- PATCH /api/users/:id/permissions

## Requests
- GET /api/:tenantId/requests
- POST /api/:tenantId/requests
- PATCH /api/:tenantId/requests/:id
- DELETE /api/:tenantId/requests/:id
- POST /api/:tenantId/requests/import-ioid-excel
- GET /api/:tenantId/requests/export-ioid-excel

## Quotations
- GET /api/:tenantId/quotations
- POST /api/:tenantId/quotations
- PATCH /api/:tenantId/quotations/:id
- POST /api/:tenantId/quotations/:id/convert-to-invoice

## Budgets
- GET /api/:tenantId/budgets
- POST /api/:tenantId/budgets
- PATCH /api/:tenantId/budgets/:id

## Invoices
- GET /api/:tenantId/invoices
- POST /api/:tenantId/invoices
- PATCH /api/:tenantId/invoices/:id

## Payments
- GET /api/:tenantId/payments
- POST /api/:tenantId/payments

## Documents
- GET /api/:tenantId/documents
- POST /api/:tenantId/documents/upload
- GET /api/:tenantId/documents/:id/view
- GET /api/:tenantId/documents/:id/download

## Reports
- GET /api/:tenantId/reports/...
- GET /api/:tenantId/analytics
- GET /api/:tenantId/audit

---

# 27. UI Requirements

The UI must remain close to the current prototype:

- Persian RTL
- sidebar navigation
- topbar with search and tenant switcher
- cards / KPI boxes
- responsive desktop/mobile
- clean modern dashboard
- same modules
- same operational terminology

Do not redesign into a completely different interface.

Improve structure and maintainability, but keep product identity.

---

# 28. Security Requirements

- password hashing with bcrypt
- JWT access/refresh tokens
- tenant isolation
- permission middleware
- file upload validation
- file size limits
- allowed mime types
- audit logs for sensitive actions
- no public access to uploaded documents without authorization
- backend permission checks on every protected route

---

# 29. Deployment Requirements

Target deployment:
- Ubuntu VPS
- Node.js backend
- PostgreSQL
- Nginx
- SSL
- PM2 or Docker Compose

Required deployment files:
- .env.example
- README.md
- database migration commands
- seed script for initial tenants/roles/admin user
- production build command
- backup instructions

---

# 30. Initial Seed Data

Create seed script for:

## Tenants
- IOID-WPA
- SOPID-CMK

## Roles
- Procurement Manager
- Procurement Officer
- Warehouse

## Permissions
All module/action permissions listed above.

## Initial Admin
Create one initial admin user via environment variables:
- ADMIN_EMAIL
- ADMIN_PASSWORD
- ADMIN_FULL_NAME

Admin must have full access to both tenants.

---

# 31. Migration from Prototype

The current prototype is HTML + IndexedDB.

Production app should include a migration/import feature:

- import JSON backup from prototype
- map stores to PostgreSQL tables
- map attachments if possible
- assign imported data to selected tenant
- validate imported records
- show migration summary

---

# 32. Acceptance Criteria

The product is accepted only if:

1. User can login.
2. User sees only tenants they have access to.
3. Tenant switcher works.
4. IOID-WPA and SOPID-CMK data are isolated.
5. Procurement Manager can manage users and permissions.
6. Procurement Officer cannot access User Management.
7. Warehouse can only access allowed modules and delivery fields.
8. IOID Excel import works.
9. IOID Excel export matches the required format.
10. Request → Quotation → Budget → Invoice → Payment workflow works.
11. Budget calculations match prototype.
12. Payment updates invoice, budget, supplier statement, dashboard.
13. Documents can be uploaded, previewed, downloaded.
14. Persian calendar works without date offset.
15. Dashboard, Executive Dashboard, Analytics, Notifications work.
16. Audit detects issues and reports production readiness.
17. System can be deployed on VPS.
18. All backend APIs enforce permissions.
19. All data is stored in PostgreSQL.
20. No critical console/backend errors.

---

# 33. Development Approach

Recommended implementation phases:

## Phase 1
Project setup:
- React frontend
- Node backend
- PostgreSQL
- Prisma
- Auth
- Tenants
- Roles
- Permissions

## Phase 2
Core modules:
- Requests
- Quotations
- Budgets
- Invoices
- Payments
- Suppliers

## Phase 3
Control Center:
- IOID Excel import/export
- Warehouse permissions

## Phase 4
Documents:
- upload
- preview
- download
- document center

## Phase 5
Dashboards:
- main dashboard
- executive dashboard
- notifications
- analytics

## Phase 6
Audit:
- final validation engine
- migration importer
- production deployment

---

# 34. Final Build Instruction

Build the production version as a real SaaS-style multi-tenant Procurement ERP.

Use the current prototype as the source of truth for features and business rules.

Do not omit:
- IOID Excel Control Center
- two tenants
- user/role/permission management
- monthly budget planning
- payment schedule
- document preview
- notification engine
- executive dashboard
- analytics and forecast
- Persian calendar
- final ERP audit

The final result must be launchable on a VPS and usable as a real operational procurement system.