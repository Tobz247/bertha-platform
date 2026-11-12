-- CreateEnum
CREATE TYPE "StockArea" AS ENUM ('STORE', 'KITCHEN');

-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "area" "StockArea" NOT NULL DEFAULT 'STORE';

