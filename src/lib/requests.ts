import "server-only";
import type { Prisma } from "@prisma/client";

/** Open requests a supplier may quote on: matching category for open requests, or a direct invite. */
export function visibleToSupplier(supplierId: string, categoryIds: string[]): Prisma.RequestWhereInput {
  return {
    OR: [
      { audience: "ALL_VERIFIED", categoryId: { in: categoryIds } },
      { invites: { some: { supplierId } } },
      { quotes: { some: { supplierId } } },
    ],
  };
}
