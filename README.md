# Internal Accounting System

Internal-use accounting web application for a Malaysian business, with
LHDN **MyInvois e-Invoice** integration (sandbox and production).

Modules: sales invoicing (invoice / credit note / debit note) with e-Invoice
submission, general ledger (double-entry, trial balance, P&L, balance sheet),
AR/AP (receipts, payments, allocation, aging), stock (weighted-average
costing), purchases (orders, supplier bills).

## Stack

Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL 16 ·
Drizzle ORM · Tailwind CSS · decimal.js for all money math ·
`@react-pdf/renderer` for PDFs · Vitest.

## Getting started

```bash
cp .env.example .env             # set APP_SECRET: openssl rand -hex 32
docker compose up -d postgres    # or any PostgreSQL 16 with DATABASE_URL set
pnpm install
pnpm db:migrate
pnpm db:seed                     # code lists, chart of accounts, demo data
pnpm dev                         # http://localhost:3000
```

Default login: `admin` / `admin123` — **change it immediately** in
Settings → Users.

Production: `pnpm build && pnpm start`, or `docker compose --profile full up`
(builds the app container; set `APP_SECRET` in `.env`).

## e-Invoice (MyInvois) setup

1. **Sandbox credentials** — register your ERP on the MyInvois preprod portal
   (https://preprod.myinvois.hasil.gov.my, via MyTax "View and Register ERP")
   to obtain a Client ID + Secret. Enter them in **Settings → e-Invoice**
   with environment **sandbox**.
2. **Company profile** — fill in TIN, BRN, MSIC code, SST number (if
   registered), address and phone in **Settings → Company Profile**. These
   are mandatory e-Invoice fields.
3. **Smoke test** — `pnpm tsx scripts/einvoice-smoke.ts` creates a test
   invoice, submits it to the sandbox, polls until valid, prints the
   validation link, then cancels it.
4. **Digital signature (production)** — production requires signed v1.1
   documents. Obtain an X.509 certificate from an IRBM-approved CA
   (e.g. Pos Digicert, MSC Trustgate), then paste the certificate + private
   key PEM in Settings → e-Invoice and enable signing. Sandbox accepts
   unsigned v1.0 documents, so you can integrate before the cert arrives.
5. **Go live** — switch environment to **production** (separate Client
   ID/Secret, self-provisioned on the live MyInvois portal).

### How submission works

Issue an invoice → the e-Invoice panel runs a pre-flight check of all
mandatory fields → submit → the app sends a UBL 2.1 JSON document to
`POST /api/v1.0/documentsubmissions` (optionally signed) → a background
poller checks validation status every 30s → on **valid**, the LHDN UUID,
long ID and validation-link QR appear on the invoice and its PDF. Valid
e-invoices can be cancelled within 72 hours (with a reason); after that,
issue a credit note. Invalid submissions show LHDN's structured errors and
can be resubmitted after fixing the data.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build && pnpm start` | run the app |
| `pnpm db:generate` | generate SQL migration from schema changes |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | seed code lists + demo data (idempotent) |
| `pnpm test` | unit tests (UBL builder, signer, GL posting, money) |
| `pnpm lint` | ESLint |
| `pnpm tsx scripts/einvoice-smoke.ts` | sandbox end-to-end test |

## Layout

```
src/db/schema/          tables (core, master, sales, einvoice, gl, arap, stock)
src/server/einvoice/    UBL builder, signer, MyInvois API client, lifecycle
src/server/gl/          posting engine + reports
src/server/documents/   numbering, issue/cancel flows
src/server/stock/       weighted-average costing
src/app/(app)/          UI routes
seeds/                  LHDN code lists, chart of accounts, demo data
tests/                  Vitest suites
```

## Notes

- All amounts are `NUMERIC` in PostgreSQL and `decimal.js` in code — no
  float arithmetic anywhere.
- Customer/company data is snapshotted onto documents at issue time; the
  e-invoice always reflects issuance-time data.
- MyInvois client secret and signing key are stored AES-256-GCM-encrypted
  with `APP_SECRET`.
- This is an internal tool, functionally inspired by commercial accounting
  packages but built from scratch.
