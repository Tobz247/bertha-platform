/**
 * Sample data for local development and demos. Every business, person and price here is made up.
 * Run with `npm run db:seed`. It wipes existing data first, so never run it against production.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const PASSWORD = "bertha-demo-2026";

const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

  await db.$transaction([
    db.portionRun.deleteMany(), db.dishSale.deleteMany(), db.recipeIngredient.deleteMany(), db.recipe.deleteMany(), db.catalogItem.deleteMany(),
    db.stockMovement.deleteMany(), db.stockBatch.deleteMany(), db.stockItem.deleteMany(),
    db.rating.deleteMany(), db.payment.deleteMany(), db.invoice.deleteMany(), db.orderEvent.deleteMany(),
    db.orderLine.deleteMany(), db.purchaseOrder.deleteMany(), db.quoteLine.deleteMany(), db.quote.deleteMany(),
    db.requestInvite.deleteMany(), db.requestLine.deleteMany(), db.request.deleteMany(),
    db.user.deleteMany(), db.business.deleteMany(), db.category.deleteMany(),
  ]);

  const hash = await bcrypt.hash(PASSWORD, 10);
  const cat = async (name: string, units: string) => db.category.create({ data: { name, units } });
  const veg = await cat("Vegetables and fruit", "kg,basket,bag,crate,bunch,bundle");
  const grains = await cat("Grains and dry goods", "50kg bag,kg,mudu,carton");
  const poultry = await cat("Poultry and eggs", "kg,crate,bird");
  const meat = await cat("Meat and fish", "kg,carton");
  const oils = await cat("Oils and condiments", "25L jerrycan,litre,carton");
  await cat("Dairy and drinks", "carton,litre,pack");

  await db.user.create({ data: { name: "Bertha Admin", email: "admin@bertha.test", passwordHash: hash, isPlatformAdmin: true, role: "OWNER" } });

  const supplier = async (name: string, area: string, cats: string[], person: string, email: string, verified = true) =>
    db.business.create({
      data: {
        name, type: "SUPPLIER", area, address: `${area} market, Abuja`, phone: "0803 000 0000",
        verification: verified ? "VERIFIED" : "PENDING",
        categories: { connect: cats.map((id) => ({ id })) },
        users: { create: { name: person, email, passwordHash: hash, role: "OWNER" } },
      },
    });
  const gwag = await supplier("Gwagwalada Fresh Farms", "Gwagwalada", [veg.id], "Musa Bello", "musa@gwagfarms.test");
  const karu = await supplier("Karu Market Wholesale", "Karu", [veg.id, oils.id], "Ngozi Eze", "ngozi@karuwholesale.test");
  const kuje = await supplier("Kuje Poultry Co-op", "Kuje", [poultry.id, meat.id], "Ibrahim Sule", "ibrahim@kujepoultry.test");
  const deidei = await supplier("Dei-Dei Grains Ltd", "Dutse", [grains.id], "Halima Yusuf", "halima@deideigrains.test");
  await supplier("Bwari Farms", "Bwari", [poultry.id], "Peter Okon", "peter@bwarifarms.test", false);

  const hotel = await db.business.create({
    data: {
      name: "Maitama Grove Hotel", type: "BUYER", area: "Maitama", address: "Plot 12, Maitama, Abuja", phone: "0809 000 0000",
      verification: "VERIFIED", approvalLimit: 500000,
    },
  });
  const tobi = await db.user.create({ data: { name: "Tobi Adeyemi", email: "tobi@maitamagrove.test", passwordHash: hash, role: "OWNER", businessId: hotel.id } });
  await db.user.create({ data: { name: "Amina Garba", email: "amina@maitamagrove.test", passwordHash: hash, role: "MANAGER", businessId: hotel.id } });
  const chef = await db.user.create({ data: { name: "Chef Kunle", email: "kunle@maitamagrove.test", passwordHash: hash, role: "STAFF", businessId: hotel.id } });

  // A request with three quotes to compare
  const r1 = await db.request.create({
    data: {
      title: "Weekend vegetables", buyerId: hotel.id, categoryId: veg.id, deliveryAddress: hotel.address,
      neededBy: day(2), quoteDeadline: day(1), createdById: chef.id,
      lines: { create: [
        { product: "Tomatoes", quantity: 6, unit: "basket", position: 0 },
        { product: "Tatashe (red pepper)", quantity: 2, unit: "basket", position: 1 },
        { product: "Onions", quantity: 3, unit: "bag", position: 2 },
      ] },
    },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  const quote = (supplierId: string, prices: number[], fee: number, deliver: number) =>
    db.quote.create({
      data: {
        requestId: r1.id, supplierId, deliveryFee: fee, deliveryDate: day(deliver), validUntil: day(3),
        lines: { create: r1.lines.map((l, i) => ({ requestLineId: l.id, unitPrice: prices[i] })) },
      },
    });
  await quote(gwag.id, [28000, 22000, 65000], 5000, 2);
  await quote(karu.id, [30000, 21000, 60000], 0, 2);

  // A large request: awarding it needs approval
  const r2 = await db.request.create({
    data: {
      title: "Chicken for the conference", buyerId: hotel.id, categoryId: poultry.id, deliveryAddress: hotel.address,
      neededBy: day(6), quoteDeadline: day(2), createdById: tobi.id,
      lines: { create: [{ product: "Whole chicken (frozen)", quantity: 120, unit: "kg", position: 0 }] },
    },
    include: { lines: true },
  });
  await db.quote.create({
    data: { requestId: r2.id, supplierId: kuje.id, deliveryFee: 10000, deliveryDate: day(5), validUntil: day(4), lines: { create: [{ requestLineId: r2.lines[0].id, unitPrice: 4800 }] } },
  });

  // An order on its way (pay on delivery)
  await db.purchaseOrder.create({
    data: {
      buyerId: hotel.id, supplierId: kuje.id, status: "DISPATCHED", paymentTermsDays: 0, deliveryFee: 2000,
      deliveryDate: day(0), deliveryAddress: hotel.address, createdById: tobi.id,
      lines: { create: [{ product: "Eggs", unit: "crate", quantity: 20, unitPrice: 5800 }] },
      events: { create: [{ actorId: tobi.id, message: "Order raised" }, { message: "Confirmed by supplier" }, { message: "Dispatched" }] },
    },
  });

  // A delivered order on 30-day terms, part paid
  const deliveredAt = day(-6);
  await db.purchaseOrder.create({
    data: {
      buyerId: hotel.id, supplierId: deidei.id, status: "RECEIVED", paymentTermsDays: 30, deliveryFee: 0,
      deliveryDate: deliveredAt, deliveryAddress: hotel.address, createdById: tobi.id, receivedAt: deliveredAt, receivedById: chef.id, createdAt: day(-8),
      lines: { create: [
        { product: "Rice, long grain", unit: "50kg bag", quantity: 10, unitPrice: 72000, receivedQty: 10, position: 0 },
        { product: "Beans (oloyin)", unit: "50kg bag", quantity: 4, unitPrice: 85000, receivedQty: 4, position: 1 },
      ] },
      invoice: { create: { number: "DDG-0831", amount: 1060000, issuedAt: deliveredAt } },
      payments: { create: { method: "TRANSFER", amount: 500000, reference: "GTB-77120384", paidAt: day(-5), recordedById: tobi.id } },
      events: { create: [{ actorId: tobi.id, message: "Order raised", at: day(-8) }, { message: "Goods received in full", at: deliveredAt }] },
      rating: { create: { buyerId: hotel.id, supplierId: deidei.id, quality: 5, accuracy: 5, timeliness: 4, price: 4 } },
    },
  });

  // Stock
  const item = async (name: string, unit: string, location: "DRY_STORE" | "COLD_ROOM" | "FREEZER", qty: number, reorderLevel: number, reorderQty: number, expires: number | null, price: number) => {
    const i = await db.stockItem.create({
      data: { buyerId: hotel.id, name, unit, location, reorderLevel, reorderQty, lastUnitPrice: price },
    });
    await db.stockBatch.create({ data: { itemId: i.id, quantity: qty, receivedAt: day(-5), expiresAt: expires == null ? null : day(expires) } });
    await db.stockMovement.create({ data: { itemId: i.id, type: "ADDED", quantity: qty, reason: "Opening stock", userId: chef.id, at: day(-5) } });
  };
  await item("Tomatoes", "basket", "COLD_ROOM", 2, 4, 6, 3, 27000);
  await item("Onions", "bag", "DRY_STORE", 1, 2, 3, 20, 62000);
  await item("Whole chicken (frozen)", "kg", "FREEZER", 18, 40, 80, 70, 4800);
  await item("Croaker fish", "kg", "FREEZER", 12, 10, 20, 2, 6500);
  await item("Rice, long grain", "50kg bag", "DRY_STORE", 9, 5, 10, 200, 72000);
  await item("Palm oil", "25L jerrycan", "DRY_STORE", 3, 2, 4, 120, 48000);
  await item("Plantain", "bunch", "DRY_STORE", 14, 10, 20, 4, 4500);

  // Supplier price lists
  const list = async (supplierId: string, categoryId: string, items: [string, string, number][], deliveryFee = 0, minOrderValue: number | null = null) => {
    await db.business.update({ where: { id: supplierId }, data: { deliveryFee, minOrderValue } });
    for (const [name, unit, price] of items) await db.catalogItem.create({ data: { supplierId, categoryId, name, unit, price } });
  };
  await list(gwag.id, veg.id, [["Tomatoes", "basket", 25000], ["Onions", "bag", 60000], ["Pepper (tatashe)", "basket", 18000], ["Plantain", "bunch", 4300]], 3000, 30000);
  await list(karu.id, veg.id, [["Tomatoes", "basket", 23500], ["Onions", "bag", 61000]], 2500);
  await list(karu.id, oils.id, [["Palm oil", "25L jerrycan", 46000], ["Groundnut oil", "25L jerrycan", 58000]]);
  await list(kuje.id, poultry.id, [["Eggs", "crate", 5600], ["Whole chicken (frozen)", "kg", 4700]], 2000);
  await list(deidei.id, grains.id, [["Rice, long grain", "50kg bag", 70000], ["Beans (oloyin)", "50kg bag", 84000]], 0, 100000);

  // A second buyer, so the going rate on Bertha has more than one business behind it
  const resto = await db.business.create({
    data: { name: "Jabi Lake Kitchen", type: "BUYER", phone: "0803 555 0192", address: "Jabi Lake Mall, Jabi", area: "Jabi", verification: "VERIFIED", approvalLimit: 300000 },
  });
  const ada = await db.user.create({ data: { name: "Ada Okafor", email: "ada@jabilakekitchen.test", passwordHash: hash, role: "OWNER", businessId: resto.id } });
  const pastOrder = async (buyerId: string, by: string, supplierId: string, ago: number, lines: [string, string, number, number][]) =>
    db.purchaseOrder.create({
      data: {
        buyerId, supplierId, status: "RECEIVED", deliveryDate: day(-ago), receivedAt: day(-ago), receivedById: by, createdAt: day(-ago - 1),
        deliveryAddress: "On file", createdById: by,
        lines: { create: lines.map(([product, unit, quantity, unitPrice], i) => ({ product, unit, quantity, unitPrice, receivedQty: quantity, position: i })) },
        events: { create: [{ actorId: by, message: "Order raised", at: day(-ago - 1) }, { message: "Goods received in full", at: day(-ago) }] },
      },
    });
  await pastOrder(resto.id, ada.id, gwag.id, 12, [["Tomatoes", "basket", 3, 22000], ["Onions", "bag", 1, 58000]]);
  await pastOrder(resto.id, ada.id, deidei.id, 9, [["Rice, long grain", "50kg bag", 3, 66000]]);
  await pastOrder(resto.id, ada.id, kuje.id, 4, [["Eggs", "crate", 6, 5400], ["Whole chicken (frozen)", "kg", 25, 4600]]);
  await pastOrder(hotel.id, tobi.id, gwag.id, 20, [["Tomatoes", "basket", 5, 24000], ["Onions", "bag", 2, 62000]]);
  await pastOrder(hotel.id, tobi.id, karu.id, 10, [["Tomatoes", "basket", 6, 27000], ["Plantain", "bunch", 20, 4500]]);
  await pastOrder(hotel.id, tobi.id, kuje.id, 15, [["Whole chicken (frozen)", "kg", 80, 4800], ["Croaker fish", "kg", 20, 6500]]);

  // Recipes, with a few days of sales
  const stock = new Map((await db.stockItem.findMany({ where: { buyerId: hotel.id } })).map((i) => [i.name, i.id]));
  const recipe = async (name: string, menuPrice: number, portions: number, ings: [string, number][]) =>
    db.recipe.create({
      data: { buyerId: hotel.id, name, menuPrice, portions, ingredients: { create: ings.map(([n, quantity]) => ({ itemId: stock.get(n)!, quantity })) } },
    });
  const jollof = await recipe("Jollof rice with chicken", 6500, 40, [["Rice, long grain", 0.3], ["Tomatoes", 0.5], ["Onions", 0.1], ["Whole chicken (frozen)", 12]]);
  await recipe("Fish pepper soup", 7000, 10, [["Croaker fish", 3], ["Onions", 0.02]]);
  const plantain = await recipe("Fried plantain (side)", 1500, 20, [["Plantain", 2], ["Palm oil", 0.05]]);
  await db.dishSale.createMany({ data: [
    { recipeId: jollof.id, quantity: 32, soldOn: day(-2), userId: chef.id },
    { recipeId: plantain.id, quantity: 25, soldOn: day(-2), userId: chef.id },
  ] });
  const move = async (name: string, type: "SOLD" | "WASTED" | "COUNT_ADJUST" | "USED", quantity: number, reason: string, ago: number) =>
    db.stockMovement.create({ data: { itemId: stock.get(name)!, type, quantity, reason, userId: chef.id, at: day(-ago) } });
  await move("Whole chicken (frozen)", "SOLD", -9.6, "Dishes sold: 32 × Jollof rice with chicken", 2);
  await move("Tomatoes", "SOLD", -0.4, "Dishes sold: 32 × Jollof rice with chicken", 2);
  await move("Plantain", "SOLD", -2.5, "Dishes sold: 25 × Fried plantain (side)", 2);
  await move("Tomatoes", "WASTED", -0.5, "Spoiled", 1);
  await move("Whole chicken (frozen)", "COUNT_ADJUST", -2.4, "Counted 18", 1);

  console.log(`Seeded. Every account uses the password "${PASSWORD}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
