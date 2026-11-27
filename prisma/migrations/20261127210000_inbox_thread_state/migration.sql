CREATE TABLE "InboxThreadState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "assigneeId" TEXT,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "followUp" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxThreadState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboxThreadState_workspaceId_key_key" ON "InboxThreadState"("workspaceId", "key");
