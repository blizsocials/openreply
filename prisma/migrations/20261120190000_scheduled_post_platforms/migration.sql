ALTER TABLE "ScheduledPost" ADD COLUMN "platforms" TEXT[] DEFAULT ARRAY['instagram']::TEXT[];
ALTER TABLE "ScheduledPost" ADD COLUMN "facebookPostId" TEXT;
