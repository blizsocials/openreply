CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "instagramAccountId" TEXT,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialConnection_workspaceId_platform_externalId_key" ON "SocialConnection"("workspaceId", "platform", "externalId");
CREATE INDEX "SocialConnection_workspaceId_idx" ON "SocialConnection"("workspaceId");

CREATE TABLE "ConnectLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "instagramAccountId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConnectLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConnectLink_token_key" ON "ConnectLink"("token");
CREATE INDEX "ConnectLink_workspaceId_idx" ON "ConnectLink"("workspaceId");

ALTER TABLE "ScheduledPost" ADD COLUMN "socialConnectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScheduledPost" ADD COLUMN "externalPostIds" JSONB;
