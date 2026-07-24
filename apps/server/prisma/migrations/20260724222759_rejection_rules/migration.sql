-- CreateTable
CREATE TABLE "RejectionRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejectionRule_projectId_idx" ON "RejectionRule"("projectId");

-- AddForeignKey
ALTER TABLE "RejectionRule" ADD CONSTRAINT "RejectionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
