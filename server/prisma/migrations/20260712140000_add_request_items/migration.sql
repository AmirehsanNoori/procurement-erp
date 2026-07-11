-- Warehouse intake: request line items + requesting unit
ALTER TABLE "requests" ADD COLUMN "requestingUnit" TEXT;

CREATE TABLE "request_items" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "requestId"   TEXT NOT NULL,
  "category"    TEXT,
  "description" TEXT NOT NULL,
  "quantity"    DECIMAL(18,3) NOT NULL DEFAULT 1,
  "unit"        TEXT,
  "unitPrice"   DECIMAL(18,2),
  "lineTotal"   DECIMAL(18,2),
  "taxAmount"   DECIMAL(18,2),
  "notes"       TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "request_items_tenantId_idx" ON "request_items"("tenantId");
CREATE INDEX "request_items_requestId_idx" ON "request_items"("requestId");
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
