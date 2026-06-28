-- Add optional assignee (user) to requests
ALTER TABLE "requests" ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "requests_assigneeId_idx" ON "requests"("assigneeId");

ALTER TABLE "requests" ADD CONSTRAINT "requests_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
