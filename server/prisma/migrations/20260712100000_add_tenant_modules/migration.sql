-- Tenant module entitlements (Core, ADR-0004). Default-allow: no row = available.
CREATE TABLE "tenant_modules" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_modules_tenantId_moduleKey_key" ON "tenant_modules"("tenantId", "moduleKey");
CREATE INDEX "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId");
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
