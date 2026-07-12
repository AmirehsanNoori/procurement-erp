-- Procure-to-receive-to-pay handoff timestamps
ALTER TABLE "invoices" ADD COLUMN "sentToWarehouseAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "sentToFinanceAt" TIMESTAMP(3);
