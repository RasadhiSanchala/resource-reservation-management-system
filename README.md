# Resource Reservation Management System (RRMS)

A full-stack resource and reservation management application developed as a **Software Engineering Internship assessment for PrimeWave Lab (Pvt) Ltd**.

RRMS helps a coordinator register shared resources (meeting rooms, equipment, and other items), inspect availability, and manage reservations without double-booking. It includes a dashboard and dedicated resource and reservation workspaces.

> **Scope and security:** This is a trusted, coordinator-operated assessment MVP. Authentication and role-based authorization are **not implemented**. Do not expose its write-enabled pages to the public internet without adding authentication, authorization, and appropriate deployment protections.

## Features

### Dashboard
- Overview with live counts of total resources, active resources, all reservations, and upcoming confirmed bookings.
- Navigation to the Resource Management and Reservation Management workspaces.

### Resource management
- Create and list resources by name, category (`ROOM`, `EQUIPMENT`, `OTHER`), and location.
- Update resource details, descriptions, and optional capacity.
- Activate and deactivate resources; maintain records for historical bookings.
- Reject duplicate normalized resource names within the same location.
- Protect future and ongoing bookings when deactivating resources or reducing capacity.
- Search and filter resources in a responsive interface.

### Reservation management
- Create reservations with requester name, optional team/purpose, optional attendee count, and a start/end time.
- Check resource availability before booking.
- Prevent overlapping **confirmed** reservations for the same resource, including concurrent booking attempts.
- Reject invalid intervals, past start times, inactive resources, and bookings exceeding configured capacity.
- Reschedule future confirmed reservations, optionally moving them to another resource.
- Cancel eligible reservations without deleting history, freeing the time slot for new bookings.
- Browse and filter reservation history by resource, status, date, and text search.
- Display and enter dates/times using **Sri Lanka Time (Asia/Colombo, UTC+05:30)**.

## Technology stack

| Layer | Technology |
| --- | --- |
| Application framework | Next.js 16 App Router |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Server-side application logic | Next.js Server Actions and feature services |
| Input validation | Zod 4 |
| ORM | Prisma ORM 7 |
| Database | Neon PostgreSQL |
| Runtime database connection | `@prisma/adapter-neon` |
| Testing | Node.js test runner via `tsx`, including database integration and concurrency tests |

## Architecture

```mermaid
flowchart TD
    User[Coordinator / Browser] --> UI[Next.js Dashboard and Workspaces]
    UI --> Actions[Next.js Server Actions]
    Actions --> Validation[Zod Validation]
    Validation --> Services[Resource and Reservation Services]
    UI --> Reads[Server Components / Read Services]
    Services --> Prisma[Prisma Client + Neon Adapter]
    Reads --> Prisma
    Prisma --> Database[(Neon PostgreSQL)]
    Database --> Constraints[Constraints, Indexes and Exclusion Rule]
```

The application separates `src/features/resources` and `src/features/reservations` by feature. Business rules execute in server-side services. Server Actions provide the interface between client-side interactions and those services; PostgreSQL provides final integrity protection.

### Database entities

```mermaid
erDiagram
    Resource ||--o{ Reservation : has
    Resource {
      uuid id PK
      string name
      enum category
      string location
      string description "optional"
      int capacity "optional"
      boolean isActive
      datetime createdAt
      datetime updatedAt
    }
    Reservation {
      uuid id PK
      uuid resourceId FK
      string requesterName
      string team "optional"
      string purpose "optional"
      int attendeeCount "optional"
      datetime startAt
      datetime endAt
      enum status
      datetime cancelledAt "optional"
      datetime createdAt
      datetime updatedAt
    }
```

**Database-enforced invariants:**

- `Resource.capacity` and `Reservation.attendeeCount` are positive when supplied.
- A reservation's `endAt` must be greater than `startAt`.
- A normalized `(name, location)` resource identity is unique, ignoring case and surrounding whitespace.
- `reservation_no_overlapping_confirmed` is a PostgreSQL **GiST exclusion constraint** on the resource and `tstzrange(startAt, endAt, '[)')`, applied to `CONFIRMED` bookings only. Half-open intervals allow adjacent bookings (e.g., 10:00–11:00 and 11:00–12:00).
- A foreign key ties each reservation to its resource, with restricted resource deletion.
- Transaction-level locks help coordinate changes; the exclusion constraint is the ultimate safeguard against concurrent double-booking.

## Getting started (Windows PowerShell)

### Prerequisites
- Node.js 22.12+ (or a compatible newer LTS release) and npm.
- Access to a Neon PostgreSQL project and database.
- Git.

### 1. Clone and install dependencies

```powershell
git clone https://github.com/RasadhiSanchala/resource-reservation-management-system.git
cd resource-reservation-management-system
# Until PR #9 is merged, select the implementation branch:
# git switch feature/9-reservation-management
npm ci
```

### 2. Configure environment variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` with connection strings from **your own Neon project**:

```dotenv
# Neon pooled connection; used by the application's Prisma client
DATABASE_URL="postgresql://USER:PASSWORD@YOUR-POOLER-HOST/DBNAME?sslmode=require"

# Neon direct (non-pooler) connection; used for Prisma migrations
DIRECT_URL="postgresql://USER:PASSWORD@YOUR-DIRECT-HOST/DBNAME?sslmode=require"
```

Both URLs must refer to the **same Neon project, branch and database**. Do not commit `.env` or share credentials. The Prisma CLI datasource is configured in `prisma7.config.ts` using `DIRECT_URL`; application runtime uses `DATABASE_URL` with the Neon adapter.

### 3. Generate Prisma client and apply migrations

```powershell
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

Migrations create the `Resource` and `Reservation` tables and the PostgreSQL constraints described above. Use a dedicated development/demo database when first setting up. **Do not run `prisma migrate reset` on a database containing valuable records.**

### 4. Verify database access

```powershell
npx tsx scripts/verify-neon-connection.ts
```

Expected: `Neon connection via Prisma: PASS` and counts of resource and reservation records.

### 5. Start the application

```powershell
npm run dev
```

Open **http://localhost:3000/** (or the port printed in your terminal).

| Route | Purpose |
| --- | --- |
| `/` | Dashboard and navigation |
| `/resources` | Resource Management |
| `/reservations` | Reservation Management |

## Verification and tests

Run static checks:

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

**Important:** Integration/concurrency tests connect to the database, create records, and clean up test data. Run them against an **isolated Neon testing branch**, not a production or important demo database. To run every test file in PowerShell:

```powershell
$testFiles = @(Get-ChildItem .\tests\*.test.ts | ForEach-Object { $_.FullName })
npx tsx --test $testFiles
```

Test coverage includes resource identity/lifecycle, reservation input validation, creation, availability, conflict prevention, concurrent operations, cancellation, rescheduling, and reservation queries. The repository also includes individual integration test files under `tests/` for targeted execution.

### Suggested manual demonstration
1. Open the Dashboard and navigate to Resources.
2. Create an active room or equipment resource with a capacity.
3. Open Reservations, check availability and create a future confirmed reservation.
4. Attempt an overlapping booking for the same resource and verify it is rejected.
5. Reschedule the reservation to another available slot.
6. Cancel the reservation and confirm the record remains in the history.
7. Book the released slot again and confirm it is available.

## Project structure

```text
src/
  app/
    page.tsx                         # Dashboard
    layout.tsx                       # Shared navigation
    resources/page.tsx               # Resource workspace
    reservations/page.tsx            # Reservation workspace
  components/                        # Navigation and reusable UI
  features/
    resources/
      actions/ schemas/ services/ components/ types/
    reservations/
      actions/ schemas/ services/ components/ types/
  lib/prisma.ts                      # Prisma + Neon runtime adapter
prisma/
  schema.prisma                      # Database model
  migrations/                        # Versioned PostgreSQL migrations
scripts/
  verify-neon-connection.ts          # Read-only connection verification
tests/                               # Unit and database integration tests
docs/
  SRS.md                             # Software requirements
  architecture/DATABASE_DESIGN.md   # Original architecture/design baseline
```

## Design decisions and limitations

- **No login/authorization:** intended for a trusted local assessment demonstration; add access controls before an internet-facing deployment.
- **Exclusive bookings:** each resource is booked by one confirmed reservation per time interval; `capacity` constrains attendee count rather than allowing multiple independent simultaneous reservations.
- **Reservation lifecycle:** cancellations are preserved as `CANCELLED` records instead of hard deletion. Rescheduling maintains the reservation identity.
- **Timezone:** persisted timestamps use PostgreSQL `timestamptz`; user-facing date/time interpretation is Asia/Colombo.
- **Availability is a preview:** another user could book a slot between checking availability and submitting. Creation repeats the conflict checks inside a transaction, and PostgreSQL prevents confirmed overlaps.
- **Documentation:** `docs/architecture/DATABASE_DESIGN.md` is the initial design baseline and may retain draft wording; the implemented schema and migrations under `prisma/` are authoritative for database behavior.

## Additional documentation

- [Software Requirements Specification](docs/SRS.md)
- [Database design baseline](docs/architecture/DATABASE_DESIGN.md)
- [Neon connectivity guide](NEON_CONNECTION_FIX_GUIDE.md)

## Repository

[GitHub — Resource Reservation Management System](https://github.com/RasadhiSanchala/resource-reservation-management-system)

---

*Built as a PrimeWave Lab software engineering internship assessment project.*
