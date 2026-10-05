# KxTill

**Offline-first point-of-sale and business operations software by KXBYTE.**

KxTill is built for growing businesses that need more than a cash register. It combines sales, inventory, customers, staff, shifts, branches, and business operations into one system — while continuing to work when the internet does not.

KxTill is designed around a flexible core that can support different business verticals without rebuilding the underlying POS engine.

---

## Table of Contents

- [What KxTill does](#what-kxtill-does)
- [Offline-first](#offline-first)
- [Multi-branch](#multi-branch)
- [Inventory](#inventory)
- [Customers \& credit](#customers--credit)
- [Staff \& shifts](#staff--shifts)
- [Reporting \& overview](#reporting--overview)
- [Flexible business schemas](#flexible-business-schemas)
- [Architecture](#architecture)
- [Technology](#technology)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Payments](#payments)
- [Product philosophy](#product-philosophy)
- [Status](#status)
- [Part of KXBYTE](#part-of-kxbyte)
- [Contributing](#contributing)
- [License](#license)

---

## What KxTill does

KxTill provides the core tools a business needs to operate its day-to-day counter and branch operations:

- Point of sale
- Product and inventory management
- Customer management
- Customer credit and payments
- Staff and role management
- Cashier shifts
- Multi-branch operations
- Branch-level stock visibility
- Offline-first sales
- Automatic synchronization
- Sales and operational overview
- Flexible payment methods
- M-Pesa integration support

The system is designed so that a business can continue selling even when connectivity is unreliable.

---

## Offline-first

Internet connectivity should not determine whether a business can make a sale.

When the connection drops, KxTill keeps the critical selling workflow available locally.

### Works offline

- Sales
- Adding customers
- Viewing relevant local data
- Core POS operations
- Local transaction recording

### Waits for connectivity

Operations that require server coordination can synchronize when the connection becomes available.

KxTill's synchronization engine is designed to allow multiple counters and devices to operate independently and safely before their changes are synchronized with the central system.

---

## Multi-branch

KxTill is built around the reality of businesses that grow beyond a single counter.

A business can manage:

- Multiple branches
- Staff assigned to branches
- Branch inventory
- Branch operations
- Multiple counters
- Sales across locations
- Central visibility of branch activity

Branches belong to the business organization rather than being isolated POS installations.

---

## Inventory

KxTill keeps inventory connected to the sales operation.

Products can support different selling models, including:

- Whole units
- Measured products
- Packaged products

Inventory operations are designed to work with the offline architecture while maintaining synchronization with the central backend.

---

## Customers & credit

KxTill includes customer accounts and a transaction ledger for businesses that allow customers to buy now and pay later.

The customer ledger supports:

- Charges
- Payments
- Partial payments
- Adjustments
- Reversals
- Outstanding balances

Payments can be recorded using different methods, allowing businesses to handle real-world transactions such as combining cash and M-Pesa payments.

---

## Staff & shifts

KxTill provides accountability around cashier operations.

When shifts are enabled for a branch:

1. A cashier opens a shift.
2. Sales are recorded against that shift.
3. Cash movement is tracked.
4. The cashier closes the shift.
5. Expected and actual cash can be compared.
6. Variances can be identified.

Shift management is optional and can be enabled at branch level.

---

## Reporting & overview

KxTill gives business owners a clear view of what is happening across the organization.

- Sales summaries — today, this week, this month
- Revenue and profit for the selected period
- Sales trend charts (hourly / daily / weekly)
- Top-selling products
- Low-stock alerts
- Branch performance comparison
- Payment-method breakdown
- Returns and refunds summary
- Exports (CSV / PDF) for sales, stock, products, branches, and audit logs

Reports respect the same branch and role scope as the rest of the application: a manager sees their branch, an owner sees the whole organization.

---

## Flexible business schemas

KxTill has a **core POS engine** rather than a completely separate application for every industry.

The core handles common operations such as:

```text
KxTill Core
├── Sales
├── Products
├── Inventory
├── Customers
├── Payments
├── Staff
├── Shifts
├── Branches
└── Synchronization
```

Industry-specific schemas can then extend the core:

```text
KxTill Core
├── + Pharmacy schema
├── + Restaurant schema
├── + Bookshop schema
└── + Hardware schema
```

This allows KxTill to adapt to different businesses without duplicating the entire POS system.

For example, a pharmacy may require batch and expiry information while a general retail store may not. The core POS functionality remains the same; the vertical schema adds what that business requires.

---

## Architecture

KxTill follows a client/server architecture with offline capabilities.

```text
┌──────────────────────────┐
│        KxTill App        │
│                          │
│  POS • Inventory • Staff │
│  Customers • Shifts      │
└────────────┬─────────────┘
             │
       Local Database
             │
       Sync Engine
             │
        Internet
             │
┌────────────▼─────────────┐
│      KxTill Backend      │
│                          │
│  Organization            │
│  Branches                │
│  Products                │
│  Sales                   │
│  Inventory               │
│  Customers               │
│  Payments                │
│  Synchronization         │
└────────────┬─────────────┘
             │
          PostgreSQL
```

The local application is not simply a cached version of the web system. It is designed to perform critical operations locally and synchronize them with the backend.

---

## Technology

### Frontend

- React Native
- Expo
- JavaScript / JSX
- Local SQLite storage
- Offline synchronization

### Backend

- Node.js
- Express
- JavaScript / ESM
- PostgreSQL
- REST API

### Infrastructure

KxTill is part of the wider **KXBYTE platform**, sharing foundational concepts such as:

- Organizations
- Branches
- Members
- Permissions
- Identity
- Subscriptions
- Product activation

---

## Project structure

The repository is organized around the KxTill application and its backend services.

```text
KxTill
├── mobile/
│   ├── screens/
│   ├── components/
│   ├── services/
│   ├── database/
│   └── sync/
│
└── backend/
    ├── modules/
    ├── routes/
    ├── services/
    └── index.js
```

> The exact structure may evolve as KxTill develops.

---

## Getting started

### Prerequisites

- Node.js 20+ (backend and mobile tooling)
- PostgreSQL 14+
- Expo CLI (`npm i -g expo-cli`) for the mobile app
- A running instance of the KXBYTE backend for authentication, organizations, branches, and subscriptions

### Backend

```bash
cd backend
cp .env.example .env       # then fill in DATABASE_URL, JWT secrets, etc.
npm install
npx prisma migrate deploy  # apply migrations
npm run dev                # starts the API
```

The backend exposes a REST API under `/api/v1`. KxTill routes live under:

```text
/api/v1/organizations/:organizationId/kxtill/*
```

### Mobile

```bash
cd mobile
npm install
npx expo start
```

Open the app in Expo Go or a development build. On first launch, sign in with a KXBYTE account, select an organization, and pick a branch.

### Environment notes

- The mobile app stores its local database in SQLite and syncs through the KxTill sync engine.
- Offline mode is automatic — no configuration required.
- Each branch gets its own local scope; switching branches resets the local cart and pending state.

---

## Payments

KxTill supports multiple payment methods through its payment architecture.

M-Pesa STK Push integration is being developed around the Safaricom Daraja ecosystem.

The goal is to allow a customer payment to move from:

```text
Customer
   ↓
M-Pesa
   ↓
Payment confirmation
   ↓
KxTill
   ↓
Sale / Customer ledger
```

without requiring the cashier to manually reconcile every transaction.

---

## Product philosophy

KxTill is built around a few principles:

### Offline first

A temporary internet outage should not stop the counter.

### Business first

The system should adapt to how a business operates rather than forcing every business into the same workflow.

### Multi-branch from the foundation

Branches are part of the core architecture, not an afterthought.

### One core, multiple verticals

Industry-specific functionality should extend the core instead of creating disconnected POS products.

### Synchronization over dependency

Devices should be able to operate independently and reconcile their changes safely.

---

## Status

KxTill is under active development and approaching production readiness.

Current focus areas include:

- Customer credit / Deni
- M-Pesa STK Push
- Multi-counter synchronization refinement
- Industry-specific schemas
- Continued production hardening

---

## Part of KXBYTE

KxTill is a product within the **KXBYTE Suite**.

KXBYTE is building connected business software around shared foundations for organizations, users, branches, permissions, billing, and product activation.

KxTill is the first major operational product built on those foundations.

---

## Contributing

KxTill is developed internally by the KXBYTE team.

If you are working on the codebase:

- Keep changes scoped to a single module or feature per pull request.
- Follow the existing folder and file naming conventions in `modules/`.
- Add or update migrations when changing the Prisma schema.
- Test offline behavior explicitly when touching sales, inventory, or sync code.

External contributions are by invitation only.

---

## License

This project is proprietary software owned by **KXBYTE Digital Solutions**.

Unauthorized copying, redistribution, or commercial use is not permitted unless explicitly authorized by KXBYTE.

---

**KxTill — run your business, even when the internet doesn't.**
