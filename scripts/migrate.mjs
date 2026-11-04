// Applies database migrations during the build.
// Migrations need a direct connection, so use the non-pooled URL when the host provides one
// (Neon: DATABASE_URL_UNPOOLED, Vercel Postgres: POSTGRES_URL_NON_POOLING), else DATABASE_URL.
import { execSync } from "node:child_process";

// Local development: read .env if present (never overrides variables the host already set).
try {
  process.loadEnvFile();
} catch {}

// Vercel preview deployments (one per pull request) share the production database settings by default.
// Only production deploys change the database, so a preview can never alter live data.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping database migrations on a ${process.env.VERCEL_ENV} deployment.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) {
  console.error("No database connection found. Add a Postgres database and set DATABASE_URL, then deploy again.");
  process.exit(1);
}
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
