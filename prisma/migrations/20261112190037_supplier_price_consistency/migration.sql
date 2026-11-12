-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "coldChain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryAreas" TEXT,
ADD COLUMN     "deliveryDays" TEXT,
ADD COLUMN     "hygieneCert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nafdacNumber" TEXT,
ADD COLUMN     "orderNoticeDays" INTEGER,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "references" TEXT,
ADD COLUMN     "supplierKind" TEXT,
ADD COLUMN     "tin" TEXT,
ADD COLUMN     "weeklyCapacity" TEXT,
ADD COLUMN     "yearsInBusiness" INTEGER;

-- CreateTable
CREATE TABLE "CatalogPriceChange" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "oldPrice" INTEGER,
    "newPrice" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PRICE_LIST',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "validFrom" TIMESTAMP(3),
    "note" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogPriceChange_supplierId_at_idx" ON "CatalogPriceChange"("supplierId", "at");

-- CreateIndex
CREATE INDEX "RateCard_supplierId_createdAt_idx" ON "RateCard"("supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starting point for price history: each item's current price (adds rows only; changes nothing existing)
INSERT INTO "CatalogPriceChange" ("id", "supplierId", "itemId", "name", "unit", "oldPrice", "newPrice", "source", "at")
SELECT 'start_' || "id", "supplierId", "id", "name", "unit", NULL, "price", 'PRICE_LIST', "updatedAt" FROM "CatalogItem";
