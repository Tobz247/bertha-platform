-- CreateEnum
CREATE TYPE "KitchenRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'ISSUED';

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "kitchenRequestId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "grnApprovedAt" TIMESTAMP(3),
ADD COLUMN     "grnApprovedById" TEXT,
ADD COLUMN     "grnNote" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "kitchenRequestId" TEXT;

-- CreateTable
CREATE TABLE "KitchenRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "buyerId" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'Kitchen',
    "neededBy" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "KitchenRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "raisedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenRequestLine" (
    "id" TEXT NOT NULL,
    "kitchenRequestId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "approvedQty" DOUBLE PRECISION,
    "issuedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KitchenRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitchenRequest_number_key" ON "KitchenRequest"("number");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_kitchenRequestId_fkey" FOREIGN KEY ("kitchenRequestId") REFERENCES "KitchenRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_grnApprovedById_fkey" FOREIGN KEY ("grnApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_kitchenRequestId_fkey" FOREIGN KEY ("kitchenRequestId") REFERENCES "KitchenRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRequest" ADD CONSTRAINT "KitchenRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRequest" ADD CONSTRAINT "KitchenRequest_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRequest" ADD CONSTRAINT "KitchenRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRequestLine" ADD CONSTRAINT "KitchenRequestLine_kitchenRequestId_fkey" FOREIGN KEY ("kitchenRequestId") REFERENCES "KitchenRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

