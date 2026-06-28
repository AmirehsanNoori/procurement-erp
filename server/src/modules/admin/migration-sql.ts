// AUTO-GENERATED from prisma/migrations. Do not edit by hand.
// Used by the one-time /api/admin/migrate endpoint to create the schema cloud-side.

export const MIGRATION_STATEMENTS: { migration: string; sql: string }[] = [
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"tenants\" (\n    \"id\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"code\" TEXT NOT NULL,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"tenants_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"users\" (\n    \"id\" TEXT NOT NULL,\n    \"fullName\" TEXT NOT NULL,\n    \"email\" TEXT NOT NULL,\n    \"passwordHash\" TEXT NOT NULL,\n    \"phone\" TEXT,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"isSuperAdmin\" BOOLEAN NOT NULL DEFAULT false,\n    \"lastLoginAt\" TIMESTAMP(3),\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"users_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"roles\" (\n    \"id\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"description\" TEXT,\n    \"isSystem\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"roles_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"tenant_users\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"userId\" TEXT NOT NULL,\n    \"roleId\" TEXT NOT NULL,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"tenant_users_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"permissions\" (\n    \"id\" TEXT NOT NULL,\n    \"key\" TEXT NOT NULL,\n    \"module\" TEXT NOT NULL,\n    \"action\" TEXT NOT NULL,\n    \"description\" TEXT,\n\n    CONSTRAINT \"permissions_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"role_permissions\" (\n    \"id\" TEXT NOT NULL,\n    \"roleId\" TEXT NOT NULL,\n    \"permissionId\" TEXT NOT NULL,\n\n    CONSTRAINT \"role_permissions_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"user_permission_overrides\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"userId\" TEXT NOT NULL,\n    \"permissionId\" TEXT NOT NULL,\n    \"allowed\" BOOLEAN NOT NULL,\n\n    CONSTRAINT \"user_permission_overrides_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"refresh_tokens\" (\n    \"id\" TEXT NOT NULL,\n    \"userId\" TEXT NOT NULL,\n    \"tokenHash\" TEXT NOT NULL,\n    \"expiresAt\" TIMESTAMP(3) NOT NULL,\n    \"revokedAt\" TIMESTAMP(3),\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"refresh_tokens_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"suppliers\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"contactPerson\" TEXT,\n    \"phone\" TEXT,\n    \"email\" TEXT,\n    \"bankAccount\" TEXT,\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"suppliers_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"requests\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"requestNumber\" TEXT NOT NULL,\n    \"orderNo\" TEXT,\n    \"title\" TEXT,\n    \"description\" TEXT,\n    \"category\" TEXT,\n    \"requestDate\" TIMESTAMP(3),\n    \"documentDate\" TIMESTAMP(3),\n    \"receivedDate\" TIMESTAMP(3),\n    \"weeklySegmentation\" TEXT,\n    \"receivedPercentage\" DECIMAL(5,2),\n    \"estimatedAmount\" DECIMAL(18,2),\n    \"supplierId\" TEXT,\n    \"status\" TEXT NOT NULL DEFAULT 'جدید',\n    \"followUpDate\" TIMESTAMP(3),\n    \"deliveryDate\" TIMESTAMP(3),\n    \"serviceDate\" TIMESTAMP(3),\n    \"driver\" TEXT,\n    \"serviceProvider\" TEXT,\n    \"notes\" TEXT,\n    \"ioidRow\" INTEGER,\n    \"ioidRemark\" TEXT,\n    \"cost\" DECIMAL(18,2),\n    \"archived\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"requests_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"quotations\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"requestId\" TEXT,\n    \"quotationNumber\" TEXT,\n    \"supplierId\" TEXT,\n    \"date\" TIMESTAMP(3),\n    \"amount\" DECIMAL(18,2),\n    \"currency\" TEXT NOT NULL DEFAULT 'ریال',\n    \"status\" TEXT NOT NULL DEFAULT 'در انتظار سفارش',\n    \"budgetId\" TEXT,\n    \"followUpDate\" TIMESTAMP(3),\n    \"deliveryDate\" TIMESTAMP(3),\n    \"serviceDate\" TIMESTAMP(3),\n    \"driver\" TEXT,\n    \"serviceProvider\" TEXT,\n    \"deliveryNotes\" TEXT,\n    \"advancePaymentAmount\" DECIMAL(18,2),\n    \"advancePaymentDate\" TIMESTAMP(3),\n    \"paymentBatchNumber\" TEXT,\n    \"accountingReference\" TEXT,\n    \"notes\" TEXT,\n    \"archived\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"quotations_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"budgets\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"name\" TEXT,\n    \"yearJalali\" INTEGER NOT NULL,\n    \"monthJalali\" INTEGER NOT NULL,\n    \"estimatedCost\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"contingencyPercent\" DECIMAL(6,2) NOT NULL DEFAULT 0,\n    \"requiredBudget\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"approvedBudget\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"manualActual\" DECIMAL(18,2),\n    \"varianceReason\" TEXT,\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"budgets_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"budget_allocations\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"budgetId\" TEXT NOT NULL,\n    \"yearJalali\" INTEGER NOT NULL,\n    \"monthJalali\" INTEGER NOT NULL,\n    \"percentage\" DECIMAL(6,2) NOT NULL DEFAULT 0,\n    \"amount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n\n    CONSTRAINT \"budget_allocations_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"invoices\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"invoiceNumber\" TEXT NOT NULL,\n    \"requestId\" TEXT,\n    \"quotationId\" TEXT,\n    \"supplierId\" TEXT,\n    \"invoiceDate\" TIMESTAMP(3),\n    \"dueDate\" TIMESTAMP(3),\n    \"netAmount\" DECIMAL(18,2),\n    \"vatAmount\" DECIMAL(18,2),\n    \"totalAmount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"status\" TEXT NOT NULL DEFAULT 'در انتظار بودجه',\n    \"budgetId\" TEXT,\n    \"batch\" TEXT,\n    \"accountingReference\" TEXT,\n    \"accountingNotes\" TEXT,\n    \"sentToAccounting\" BOOLEAN NOT NULL DEFAULT false,\n    \"accountingSubmissionDate\" TIMESTAMP(3),\n    \"followUpDate\" TIMESTAMP(3),\n    \"notes\" TEXT,\n    \"archived\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"invoices_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"installments\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"invoiceId\" TEXT NOT NULL,\n    \"amount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"percent\" DECIMAL(6,2),\n    \"monthKey\" TEXT,\n    \"dueDate\" TIMESTAMP(3),\n    \"status\" TEXT NOT NULL DEFAULT 'در انتظار',\n    \"notes\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"installments_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"payments\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"invoiceId\" TEXT NOT NULL,\n    \"paymentDate\" TIMESTAMP(3),\n    \"amount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"paymentListNumber\" TEXT,\n    \"reference\" TEXT,\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"payments_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"documents\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"entityType\" TEXT NOT NULL,\n    \"entityId\" TEXT NOT NULL,\n    \"category\" TEXT,\n    \"filename\" TEXT NOT NULL,\n    \"originalFilename\" TEXT,\n    \"mimeType\" TEXT,\n    \"size\" INTEGER,\n    \"storagePath\" TEXT NOT NULL,\n    \"uploadedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"documents_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"tasks\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"title\" TEXT NOT NULL,\n    \"description\" TEXT,\n    \"priority\" INTEGER NOT NULL DEFAULT 2,\n    \"dueDate\" TIMESTAMP(3),\n    \"followUpDate\" TIMESTAMP(3),\n    \"status\" TEXT NOT NULL DEFAULT 'در انتظار',\n    \"relatedRequestId\" TEXT,\n    \"relatedInvoiceId\" TEXT,\n    \"assignedToId\" TEXT,\n    \"archived\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdById\" TEXT,\n    \"updatedById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"tasks_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"timeline_events\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"entityType\" TEXT NOT NULL,\n    \"entityId\" TEXT NOT NULL,\n    \"eventType\" TEXT NOT NULL,\n    \"eventDate\" TIMESTAMP(3),\n    \"userId\" TEXT,\n    \"userName\" TEXT,\n    \"supplier\" TEXT,\n    \"reference\" TEXT,\n    \"notes\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"timeline_events_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"notifications\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"type\" TEXT NOT NULL,\n    \"level\" TEXT NOT NULL,\n    \"title\" TEXT NOT NULL,\n    \"description\" TEXT,\n    \"entityType\" TEXT,\n    \"entityId\" TEXT,\n    \"reference\" TEXT,\n    \"isRead\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"notifications_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE TABLE \"audit_logs\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT,\n    \"userId\" TEXT,\n    \"action\" TEXT NOT NULL,\n    \"entityType\" TEXT,\n    \"entityId\" TEXT,\n    \"metadata\" JSONB,\n    \"ip\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"audit_logs_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"tenants_code_key\" ON \"tenants\"(\"code\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"users_email_key\" ON \"users\"(\"email\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"roles_name_key\" ON \"roles\"(\"name\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"tenant_users_userId_idx\" ON \"tenant_users\"(\"userId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"tenant_users_tenantId_userId_key\" ON \"tenant_users\"(\"tenantId\", \"userId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"permissions_key_key\" ON \"permissions\"(\"key\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"permissions_module_idx\" ON \"permissions\"(\"module\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"role_permissions_roleId_permissionId_key\" ON \"role_permissions\"(\"roleId\", \"permissionId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"user_permission_overrides_tenantId_userId_permissionId_key\" ON \"user_permission_overrides\"(\"tenantId\", \"userId\", \"permissionId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"refresh_tokens_tokenHash_key\" ON \"refresh_tokens\"(\"tokenHash\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"refresh_tokens_userId_idx\" ON \"refresh_tokens\"(\"userId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"suppliers_tenantId_idx\" ON \"suppliers\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"requests_tenantId_idx\" ON \"requests\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"requests_tenantId_status_idx\" ON \"requests\"(\"tenantId\", \"status\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"requests_tenantId_requestNumber_key\" ON \"requests\"(\"tenantId\", \"requestNumber\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"quotations_tenantId_idx\" ON \"quotations\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"quotations_tenantId_status_idx\" ON \"quotations\"(\"tenantId\", \"status\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"budgets_tenantId_idx\" ON \"budgets\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"budgets_tenantId_yearJalali_monthJalali_idx\" ON \"budgets\"(\"tenantId\", \"yearJalali\", \"monthJalali\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"budget_allocations_budgetId_idx\" ON \"budget_allocations\"(\"budgetId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"invoices_tenantId_idx\" ON \"invoices\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"invoices_tenantId_status_idx\" ON \"invoices\"(\"tenantId\", \"status\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE UNIQUE INDEX \"invoices_tenantId_invoiceNumber_key\" ON \"invoices\"(\"tenantId\", \"invoiceNumber\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"installments_tenantId_idx\" ON \"installments\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"installments_invoiceId_idx\" ON \"installments\"(\"invoiceId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"payments_tenantId_idx\" ON \"payments\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"payments_invoiceId_idx\" ON \"payments\"(\"invoiceId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"documents_tenantId_idx\" ON \"documents\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"documents_tenantId_entityType_entityId_idx\" ON \"documents\"(\"tenantId\", \"entityType\", \"entityId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"tasks_tenantId_idx\" ON \"tasks\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"tasks_tenantId_status_idx\" ON \"tasks\"(\"tenantId\", \"status\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"timeline_events_tenantId_idx\" ON \"timeline_events\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"timeline_events_tenantId_entityType_entityId_idx\" ON \"timeline_events\"(\"tenantId\", \"entityType\", \"entityId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"notifications_tenantId_idx\" ON \"notifications\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"audit_logs_tenantId_idx\" ON \"audit_logs\"(\"tenantId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "CREATE INDEX \"audit_logs_userId_idx\" ON \"audit_logs\"(\"userId\")"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"tenant_users\" ADD CONSTRAINT \"tenant_users_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"tenant_users\" ADD CONSTRAINT \"tenant_users_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES \"users\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"tenant_users\" ADD CONSTRAINT \"tenant_users_roleId_fkey\" FOREIGN KEY (\"roleId\") REFERENCES \"roles\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"role_permissions\" ADD CONSTRAINT \"role_permissions_roleId_fkey\" FOREIGN KEY (\"roleId\") REFERENCES \"roles\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"role_permissions\" ADD CONSTRAINT \"role_permissions_permissionId_fkey\" FOREIGN KEY (\"permissionId\") REFERENCES \"permissions\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"user_permission_overrides\" ADD CONSTRAINT \"user_permission_overrides_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"user_permission_overrides\" ADD CONSTRAINT \"user_permission_overrides_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES \"users\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"user_permission_overrides\" ADD CONSTRAINT \"user_permission_overrides_permissionId_fkey\" FOREIGN KEY (\"permissionId\") REFERENCES \"permissions\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"refresh_tokens\" ADD CONSTRAINT \"refresh_tokens_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES \"users\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"suppliers\" ADD CONSTRAINT \"suppliers_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"requests\" ADD CONSTRAINT \"requests_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"requests\" ADD CONSTRAINT \"requests_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"quotations\" ADD CONSTRAINT \"quotations_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"quotations\" ADD CONSTRAINT \"quotations_requestId_fkey\" FOREIGN KEY (\"requestId\") REFERENCES \"requests\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"quotations\" ADD CONSTRAINT \"quotations_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"quotations\" ADD CONSTRAINT \"quotations_budgetId_fkey\" FOREIGN KEY (\"budgetId\") REFERENCES \"budgets\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"budgets\" ADD CONSTRAINT \"budgets_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"budget_allocations\" ADD CONSTRAINT \"budget_allocations_budgetId_fkey\" FOREIGN KEY (\"budgetId\") REFERENCES \"budgets\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"invoices\" ADD CONSTRAINT \"invoices_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"invoices\" ADD CONSTRAINT \"invoices_requestId_fkey\" FOREIGN KEY (\"requestId\") REFERENCES \"requests\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"invoices\" ADD CONSTRAINT \"invoices_quotationId_fkey\" FOREIGN KEY (\"quotationId\") REFERENCES \"quotations\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"invoices\" ADD CONSTRAINT \"invoices_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"invoices\" ADD CONSTRAINT \"invoices_budgetId_fkey\" FOREIGN KEY (\"budgetId\") REFERENCES \"budgets\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"installments\" ADD CONSTRAINT \"installments_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"installments\" ADD CONSTRAINT \"installments_invoiceId_fkey\" FOREIGN KEY (\"invoiceId\") REFERENCES \"invoices\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"payments\" ADD CONSTRAINT \"payments_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"payments\" ADD CONSTRAINT \"payments_invoiceId_fkey\" FOREIGN KEY (\"invoiceId\") REFERENCES \"invoices\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"documents\" ADD CONSTRAINT \"documents_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"tasks\" ADD CONSTRAINT \"tasks_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"timeline_events\" ADD CONSTRAINT \"timeline_events_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"notifications\" ADD CONSTRAINT \"notifications_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260621182252_init",
    "sql": "ALTER TABLE \"audit_logs\" ADD CONSTRAINT \"audit_logs_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE TABLE \"approval_workflows\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"entityType\" TEXT NOT NULL,\n    \"steps\" JSONB NOT NULL,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"approval_workflows_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE TABLE \"approval_instances\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"workflowId\" TEXT NOT NULL,\n    \"entityType\" TEXT NOT NULL,\n    \"entityId\" TEXT NOT NULL,\n    \"currentStep\" INTEGER NOT NULL DEFAULT 0,\n    \"status\" TEXT NOT NULL DEFAULT 'در انتظار',\n    \"requestedById\" TEXT,\n    \"notes\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"approval_instances_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE TABLE \"approval_votes\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"instanceId\" TEXT NOT NULL,\n    \"step\" INTEGER NOT NULL,\n    \"userId\" TEXT NOT NULL,\n    \"decision\" TEXT NOT NULL,\n    \"notes\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"approval_votes_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE INDEX \"approval_workflows_tenantId_idx\" ON \"approval_workflows\"(\"tenantId\")"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE INDEX \"approval_instances_tenantId_idx\" ON \"approval_instances\"(\"tenantId\")"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "CREATE INDEX \"approval_instances_tenantId_entityType_entityId_idx\" ON \"approval_instances\"(\"tenantId\", \"entityType\", \"entityId\")"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_workflows\" ADD CONSTRAINT \"approval_workflows_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_instances\" ADD CONSTRAINT \"approval_instances_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_instances\" ADD CONSTRAINT \"approval_instances_workflowId_fkey\" FOREIGN KEY (\"workflowId\") REFERENCES \"approval_workflows\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_votes\" ADD CONSTRAINT \"approval_votes_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_votes\" ADD CONSTRAINT \"approval_votes_instanceId_fkey\" FOREIGN KEY (\"instanceId\") REFERENCES \"approval_instances\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627115730_add_approval_workflow",
    "sql": "ALTER TABLE \"approval_votes\" ADD CONSTRAINT \"approval_votes_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES \"users\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE"
  },
  {
    "migration": "20260627122603_add_correspondence",
    "sql": "CREATE TABLE \"correspondences\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"letterNumber\" TEXT,\n    \"direction\" TEXT NOT NULL,\n    \"subject\" TEXT NOT NULL,\n    \"body\" TEXT,\n    \"senderName\" TEXT,\n    \"recipientName\" TEXT,\n    \"letterDate\" TIMESTAMP(3),\n    \"receivedDate\" TIMESTAMP(3),\n    \"priority\" TEXT NOT NULL DEFAULT 'عادی',\n    \"status\" TEXT NOT NULL DEFAULT 'ثبت شده',\n    \"relatedRequestId\" TEXT,\n    \"relatedInvoiceId\" TEXT,\n    \"attachmentPath\" TEXT,\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"correspondences_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627122603_add_correspondence",
    "sql": "CREATE INDEX \"correspondences_tenantId_idx\" ON \"correspondences\"(\"tenantId\")"
  },
  {
    "migration": "20260627122603_add_correspondence",
    "sql": "ALTER TABLE \"correspondences\" ADD CONSTRAINT \"correspondences_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627122603_add_correspondence",
    "sql": "ALTER TABLE \"correspondences\" ADD CONSTRAINT \"correspondences_relatedRequestId_fkey\" FOREIGN KEY (\"relatedRequestId\") REFERENCES \"requests\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260627122603_add_correspondence",
    "sql": "ALTER TABLE \"correspondences\" ADD CONSTRAINT \"correspondences_relatedInvoiceId_fkey\" FOREIGN KEY (\"relatedInvoiceId\") REFERENCES \"invoices\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE TABLE \"supplier_contacts\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"supplierId\" TEXT NOT NULL,\n    \"fullName\" TEXT NOT NULL,\n    \"role\" TEXT,\n    \"phone\" TEXT,\n    \"email\" TEXT,\n    \"notes\" TEXT,\n    \"isPrimary\" BOOLEAN NOT NULL DEFAULT false,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"supplier_contacts_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE TABLE \"supplier_interactions\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"supplierId\" TEXT NOT NULL,\n    \"type\" TEXT NOT NULL DEFAULT 'یادداشت',\n    \"subject\" TEXT,\n    \"body\" TEXT,\n    \"interactionDate\" TIMESTAMP(3),\n    \"followUpDate\" TIMESTAMP(3),\n    \"createdById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"supplier_interactions_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE TABLE \"blanket_orders\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"supplierId\" TEXT NOT NULL,\n    \"orderNumber\" TEXT,\n    \"description\" TEXT NOT NULL,\n    \"totalValue\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"usedValue\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"currency\" TEXT NOT NULL DEFAULT 'ریال',\n    \"startDate\" TIMESTAMP(3),\n    \"endDate\" TIMESTAMP(3),\n    \"status\" TEXT NOT NULL DEFAULT 'فعال',\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"blanket_orders_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE INDEX \"supplier_contacts_tenantId_supplierId_idx\" ON \"supplier_contacts\"(\"tenantId\", \"supplierId\")"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE INDEX \"supplier_interactions_tenantId_supplierId_idx\" ON \"supplier_interactions\"(\"tenantId\", \"supplierId\")"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE INDEX \"blanket_orders_tenantId_idx\" ON \"blanket_orders\"(\"tenantId\")"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "CREATE INDEX \"blanket_orders_tenantId_supplierId_idx\" ON \"blanket_orders\"(\"tenantId\", \"supplierId\")"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"supplier_contacts\" ADD CONSTRAINT \"supplier_contacts_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"supplier_contacts\" ADD CONSTRAINT \"supplier_contacts_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"supplier_interactions\" ADD CONSTRAINT \"supplier_interactions_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"supplier_interactions\" ADD CONSTRAINT \"supplier_interactions_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"blanket_orders\" ADD CONSTRAINT \"blanket_orders_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627123221_add_supplier_crm_blanket",
    "sql": "ALTER TABLE \"blanket_orders\" ADD CONSTRAINT \"blanket_orders_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"suppliers\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "CREATE TABLE \"expense_reports\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"reportNumber\" TEXT,\n    \"title\" TEXT NOT NULL,\n    \"submittedBy\" TEXT,\n    \"department\" TEXT,\n    \"periodStart\" TIMESTAMP(3),\n    \"periodEnd\" TIMESTAMP(3),\n    \"totalAmount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"currency\" TEXT NOT NULL DEFAULT 'ریال',\n    \"status\" TEXT NOT NULL DEFAULT 'پیش‌نویس',\n    \"notes\" TEXT,\n    \"createdById\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" TIMESTAMP(3) NOT NULL,\n\n    CONSTRAINT \"expense_reports_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "CREATE TABLE \"expense_items\" (\n    \"id\" TEXT NOT NULL,\n    \"reportId\" TEXT NOT NULL,\n    \"category\" TEXT NOT NULL,\n    \"description\" TEXT NOT NULL,\n    \"amount\" DECIMAL(18,2) NOT NULL,\n    \"expenseDate\" TIMESTAMP(3),\n    \"receiptRef\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"expense_items_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "CREATE INDEX \"expense_reports_tenantId_idx\" ON \"expense_reports\"(\"tenantId\")"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "CREATE INDEX \"expense_items_reportId_idx\" ON \"expense_items\"(\"reportId\")"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "ALTER TABLE \"expense_reports\" ADD CONSTRAINT \"expense_reports_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627125408_add_expense_reports",
    "sql": "ALTER TABLE \"expense_items\" ADD CONSTRAINT \"expense_items_reportId_fkey\" FOREIGN KEY (\"reportId\") REFERENCES \"expense_reports\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE"
  },
  {
    "migration": "20260627132421_add_subscription",
    "sql": "ALTER TABLE \"tenants\" ADD COLUMN     \"billingName\" TEXT,\nADD COLUMN     \"contactEmail\" TEXT,\nADD COLUMN     \"maxUsers\" INTEGER NOT NULL DEFAULT 5,\nADD COLUMN     \"plan\" TEXT NOT NULL DEFAULT 'free',\nADD COLUMN     \"planExpiresAt\" TIMESTAMP(3),\nADD COLUMN     \"trialEndsAt\" TIMESTAMP(3)"
  },
  {
    "migration": "20260627132421_add_subscription",
    "sql": "CREATE TABLE \"billing_invoices\" (\n    \"id\" TEXT NOT NULL,\n    \"tenantId\" TEXT NOT NULL,\n    \"invoiceNo\" TEXT,\n    \"plan\" TEXT NOT NULL,\n    \"amount\" DECIMAL(18,2) NOT NULL DEFAULT 0,\n    \"currency\" TEXT NOT NULL DEFAULT 'ریال',\n    \"status\" TEXT NOT NULL DEFAULT 'پرداخت شده',\n    \"periodStart\" TIMESTAMP(3),\n    \"periodEnd\" TIMESTAMP(3),\n    \"notes\" TEXT,\n    \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT \"billing_invoices_pkey\" PRIMARY KEY (\"id\")\n)"
  },
  {
    "migration": "20260627132421_add_subscription",
    "sql": "ALTER TABLE \"billing_invoices\" ADD CONSTRAINT \"billing_invoices_tenantId_fkey\" FOREIGN KEY (\"tenantId\") REFERENCES \"tenants\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE"
  }
];
