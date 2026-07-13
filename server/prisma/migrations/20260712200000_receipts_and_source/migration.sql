ALTER TABLE "requests" ADD COLUMN "source" TEXT;
CREATE TABLE "goods_receipts" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE,
  "refModule" TEXT, "refType" TEXT, "refId" TEXT, "requestRefId" TEXT, "note" TEXT, "receivedById" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "goods_receipts_tenantId_idx" ON "goods_receipts"("tenantId");
CREATE INDEX "goods_receipts_refId_idx" ON "goods_receipts"("refId");
CREATE TABLE "goods_receipt_items" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL REFERENCES "goods_receipts"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "quantity" DECIMAL(18,3) NOT NULL, "note" TEXT
);
CREATE INDEX "goods_receipt_items_receiptId_idx" ON "goods_receipt_items"("receiptId");
