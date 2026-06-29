-- RFQ: mark the chosen winning quotation for a request
ALTER TABLE "quotations" ADD COLUMN "isWinner" BOOLEAN NOT NULL DEFAULT false;
