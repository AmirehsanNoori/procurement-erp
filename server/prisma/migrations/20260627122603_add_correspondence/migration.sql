-- CreateTable
CREATE TABLE "correspondences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "letterNumber" TEXT,
    "direction" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "senderName" TEXT,
    "recipientName" TEXT,
    "letterDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'عادی',
    "status" TEXT NOT NULL DEFAULT 'ثبت شده',
    "relatedRequestId" TEXT,
    "relatedInvoiceId" TEXT,
    "attachmentPath" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correspondences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "correspondences_tenantId_idx" ON "correspondences"("tenantId");

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_relatedRequestId_fkey" FOREIGN KEY ("relatedRequestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
