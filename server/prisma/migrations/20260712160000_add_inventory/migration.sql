-- Inventory / Warehouse module
CREATE TABLE "products" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "category" TEXT, "unit" TEXT, "barcode" TEXT, "minStock" DECIMAL(18,3),
  "isActive" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_tenantId_code_key" ON "products"("tenantId","code");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "warehouses" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "location" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId","code");
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_movements" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
  "type" TEXT NOT NULL, "quantity" DECIMAL(18,3) NOT NULL, "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refModule" TEXT, "refType" TEXT, "refId" TEXT, "note" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_tenantId_idx" ON "stock_movements"("tenantId");
CREATE INDEX "stock_movements_productId_idx" ON "stock_movements"("productId");
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_levels" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_key" ON "stock_levels"("productId","warehouseId");
CREATE INDEX "stock_levels_tenantId_idx" ON "stock_levels"("tenantId");
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
