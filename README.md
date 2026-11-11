# Bertha Services platform

Procurement, order management and stock control for hotels, restaurants and other food businesses in Abuja.
Buyers ask verified suppliers for quotes, compare them, award one, track the order to delivery and payment,
and keep their stock up to date from what arrives.

## What's in this version

**Buyers (hotels, restaurants, caterers)**
- Requests for quotes with several items, sent to every verified supplier in a category or to a shortlist
- Side-by-side quote comparison: lowest total, earliest delivery, supplier rating
- Award a quote to raise a purchase order, on pay-on-delivery or 7/14/30-day terms
- Manager approval for orders above the business's approval limit (default ₦500,000)
- Goods received: count what arrived, flag short or poor deliveries, set use-by dates
- Invoice check against what was received, and cash or transfer payments recorded against each order
- Supplier ratings after delivery
- Stock: batches with use-by dates, usage and waste (oldest batch first), stock counts, low-stock and
  expiring alerts, and one-click reorder into a new request
- Team members with Owner, Manager and Staff roles
- Suppliers directory and ordering straight from a supplier's price list (no quote round needed);
  approval limits, minimum order and delivery fee still apply
- Prices: what you paid for each item over time, the going rate on Bertha (median of the last 60 days,
  shown once two or more businesses bought the item), spend by supplier, and flags on quotes and price
  lists that are more than 10% above your last price or the going rate
- Goods received notes: a printable note (GRN) for every delivery with received quantities, prices, totals,
  invoice check, who received it and signature lines for the accounts office; a Goods received page lists
  them by date and prints them all at once
- Portion control: cut bulk meat, chicken or fish into counted, weighed pieces; Bertha adds a "pieces" stock
  item and shows cost per piece, average piece weight and yield
- Recipes: dishes built from stock items, cost per plate and food cost % (flagged above 35%); recording
  dishes sold takes the ingredients out of stock, and a weekly view shows sold vs other use, waste and
  shortfalls found in stock counts

**Suppliers**
- Sign up, choose categories, add bank details; quote once verified
- Inbox of matching requests, quote or update a quote, withdraw
- Accept or decline orders, mark dispatched, raise invoices, see payments
- Price list with stock on/off, minimum quantities, delivery fee and minimum order, compared with the going rate

**Platform admin**
- Verify or reject suppliers, manage categories

Not yet included: online payments, SMS/WhatsApp messages (calls go through `src/lib/notify.ts`, which only logs
for now), logistics booking, invoice photo scanning, POS/accounting links, multiple branches and forecasting.

## Tech

Next.js 15 (App Router, server actions), TypeScript, PostgreSQL with Prisma, cookie sessions signed with `jose`,
passwords hashed with bcrypt. Money is stored in whole Naira.

## Running it locally

You need Node 20+ and PostgreSQL.

```bash
cp .env.example .env          # then set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate            # creates the tables
npm run db:seed               # optional: sample Abuja hotel, suppliers and orders (wipes the database)
npm run dev                   # http://localhost:3000
```

Sample accounts after seeding all use the password `bertha-demo-2026`:

| Who | Email |
| --- | --- |
| Hotel owner | tobi@maitamagrove.test |
| Hotel manager (approves) | amina@maitamagrove.test |
| Hotel staff | kunle@maitamagrove.test |
| Restaurant owner | ada@jabilakekitchen.test |
| Supplier | ngozi@karuwholesale.test, musa@gwagfarms.test, ibrahim@kujepoultry.test |
| Supplier waiting for checks | peter@bwarifarms.test |
| Platform admin | admin@bertha.test |

## Checks

```bash
npm run lint   # type-check
npm test       # business rules (totals, approvals, payment status, stock)
npm run build
```

## Deploying (Vercel)

1. In Vercel, import this GitHub repository as a new project (framework: Next.js).
2. Add a Postgres database to the project: **Prisma Postgres** or **Neon** from the Storage tab or the
   integrations offered on import. Vercel sets `DATABASE_URL` for you.
3. In **Settings → Environment Variables**, add `SESSION_SECRET` (a long random string) and `ADMIN_EMAILS`
   (your email; comma-separate several).
4. Redeploy. The build runs the migrations (`scripts/migrate.mjs`), which create the tables and the starting
   categories on production deploys only (preview deploys never touch the database). It uses a direct connection (`DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`) when one is set.
5. Sign up with an email from `ADMIN_EMAILS`. You'll see **Platform admin** in the menu, where you verify suppliers.

Never run `npm run db:seed` against the live database: it deletes everything first.

Any other Node host works the same way: set the four environment variables, then `npm run build` and `npm start`.
