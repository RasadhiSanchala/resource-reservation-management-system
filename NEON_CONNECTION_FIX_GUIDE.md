# RRMS — Neon runtime connection fix (14 October 2026)

## Diagnosis from the supplied project and logs

- Next.js/TypeScript/ESLint/build passed; both `/resources` and `/reservations` failed with Prisma `P1017` (`ConnectionClosed`).
- A separate `pg` driver check previously failed with `timeout expired`. This indicates a connection/transport problem **below the individual resource or reservation services**.
- The original `src/lib/prisma.ts` used `@prisma/adapter-pg`, which connects over TCP port 5432.
- The updated `src/lib/prisma.ts` uses the officially supported `@prisma/adapter-neon` (WebSocket transport), avoiding the need for a client-to-Neon PostgreSQL TCP connection.
- **This is a targeted workaround, not an offline proof that the user's network can reach Neon.** A network that blocks WebSockets, invalid connection credentials, or a Neon service disruption can still prevent connection.

## What changed

1. `src/lib/prisma.ts`: replace the `PrismaPg` runtime adapter with `PrismaNeon`. Preserve the exported `prisma` singleton and `DATABASE_URL` usage.
2. `package.json`: add `@prisma/adapter-neon` 7.10.0 to runtime dependencies.
3. `scripts/verify-neon-connection.ts`: add a **read-only** database verification script.
4. `NEON_CONNECTION_FIX_GUIDE.md`: these instructions.

**No changes** to the Prisma models, existing migrations, exclusion constraint, unique resource index, resource lifecycle checks, reservation services, business rules, cancellation/reschedule logic or UI.

## IMPORTANT: dependency lock file

This ZIP retains your original `package-lock.json`. This environment cannot access npm's package registry, so the newly required dependency's resolved packages could not be added to it here. **Before running `npm ci`, run `npm install` on your computer to regenerate the lock file.** Commit both `package.json` and the regenerated `package-lock.json` together.

## Safe installation (Windows PowerShell)

1. **Back up your current project and `.env`.** This ZIP intentionally does NOT include your private `.env`.
2. Open the project root in PowerShell. If extracting as a replacement, copy your existing `.env` back into the root. Do NOT share or commit `.env`.
3. Stop all existing Next.js dev processes (`Ctrl+C`).
4. Run:

   ```powershell
   npm install
   npx prisma generate --config prisma7.config.ts
   npx tsx scripts/verify-neon-connection.ts
   ```

   If Prisma rejects the explicit config flag, try `npx prisma generate` instead. **Do not run `prisma migrate reset`, `db push` or reapply migrations** merely to solve this connection problem.

5. If the verification prints `Neon connection via Prisma: PASS`, run:

   ```powershell
   npx tsc --noEmit
   npm run lint
   npm run build
   npm run dev
   ```

6. Open `http://localhost:3000/resources` and `http://localhost:3000/reservations`.

## Environment checks

Keep `DATABASE_URL` as the **Neon pooled endpoint** (hostname contains `-pooler`) and `DIRECT_URL` as the non-pooled endpoint for Prisma migrations, both from the **same** database/branch. Do not edit the DB password in code. The existing `prisma7.config.ts` handles the direct URL for migration commands.

The driver may emit a warning about `sslmode=require` aliases. This warning alone is not a failed connection; do not disable TLS verification to suppress it.

## If it STILL fails

- Test if ordinary HTTPS (TCP port 443) and WSS traffic to your Neon endpoint are allowed on your Wi-Fi, VPN, proxy and firewall.
- Try a mobile hotspot to distinguish corporate/ISP blocks from code problems.
- Verify that the matching Neon project/branch is active and its connection string is current.
- Share only sanitized error code and error class, never the `.env` or full DATABASE_URL.
- Production deployment with an unauthenticated mutation UI is **not** advised; this assessment is a trusted local demo.

## Existing behavior preserved

`Resource`/`Reservation` models, GiST exclusion for `[startAt,endAt)` confirmed bookings, `SELECT ... FOR UPDATE` transaction locks, capacity checks, inactive-resource protection, cancellation history and rescheduling rollback are not modified. The Neon adapter supports Prisma Client transactions and the existing raw SQL statements, but verify against your live Neon branch before declaring the bug resolved.

Official references:
- https://neon.com/docs/guides/prisma
- https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers
