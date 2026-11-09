-- CreateTable
CREATE TABLE "map_drafts" (
    "spaceId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_drafts_pkey" PRIMARY KEY ("spaceId")
);

-- AddForeignKey
ALTER TABLE "map_drafts" ADD CONSTRAINT "map_drafts_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
