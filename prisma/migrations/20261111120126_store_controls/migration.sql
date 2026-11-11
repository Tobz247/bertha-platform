-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'PORTIONED';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "receivedById" TEXT;

-- CreateTable
CREATE TABLE "PortionRun" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "fromItemId" TEXT NOT NULL,
    "toItemId" TEXT NOT NULL,
    "inputQty" DOUBLE PRECISION NOT NULL,
    "pieces" INTEGER NOT NULL,
    "totalWeight" DOUBLE PRECISION,
    "cost" INTEGER NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortionRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortionRun" ADD CONSTRAINT "PortionRun_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortionRun" ADD CONSTRAINT "PortionRun_fromItemId_fkey" FOREIGN KEY ("fromItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortionRun" ADD CONSTRAINT "PortionRun_toItemId_fkey" FOREIGN KEY ("toItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortionRun" ADD CONSTRAINT "PortionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
