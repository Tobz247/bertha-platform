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

**Suppliers**
- Sign up, choose categories, add bank details; quote once verified
- Inbox of matching requests, quote or update a quote, withdraw
- Accept or decline orders, mark dispatched, raise invoices, see payments

**Platform admin**
- Verify or reject suppliers, manage categories

Not yet included: online payments, SMS/WhatsApp messages (calls go through `src/lib/notify.ts`, which only logs
for now), logistics booking, market prices and forecasting.

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
| Supplier | ngozi@karuwholesale.test, musa@gwagfarms.test, ibrahim@kujepoultry.test |
| Supplier waiting for checks | peter@bwarifarms.test |
| Platform admin | admin@bertha.test |

## Checks

```bash
npm run lint   # type-check
npm test       # business rules (totals, approvals, payment status, stock)
npm run build
```

## Deploying (Vercel + Neon)

1. In Vercel, import this GitHub repository as a new project (framework: Next.js).
2. In the project's **Storage** tab, add a **Neon** Postgres database. Vercel sets `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` for you.
3. In **Settings → Environment Variables**, add `SESSION_SECRET` (a long random string) and `ADMIN_EMAILS`
   (your email, comma-separate several).
4. Redeploy. The build runs `prisma migrate deploy`, which creates the tables and the starting categories.
5. Sign up with an email from `ADMIN_EMAILS`. You'll see **Platform admin** in the menu, where you verify suppliers.

Never run `npm run db:seed` against the live database: it deletes everything first.

Any other Node host works the same way: set the four environment variables, then `npm run build` and `npm start`.
