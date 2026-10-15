import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

const statCardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className={statCardClass}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

/**
 * Counts are read at request time, not during prerendering.
 * If Neon is briefly unavailable, links remain usable.
 */
async function DashboardMetrics() {
  await connection();

  try {
    const now = new Date();
    const [totalResources, activeResources, totalReservations, upcomingReservations] =
      await Promise.all([
        prisma.resource.count(),
        prisma.resource.count({ where: { isActive: true } }),
        prisma.reservation.count(),
        prisma.reservation.count({
          where: { status: "CONFIRMED", startAt: { gt: now } },
        }),
      ]);

    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <StatCard label="Total resources" value={totalResources} hint="All registered resources" />
        <StatCard label="Active resources" value={activeResources} hint="Available for new bookings" />
        <StatCard label="All reservations" value={totalReservations} hint="Including cancelled history" />
        <StatCard label="Upcoming bookings" value={upcomingReservations} hint="Future confirmed reservations" />
      </div>
    );
  } catch (error) {
    // Keep the dashboard and navigation accessible during a database outage.
    console.error("Unable to load dashboard metrics:", error);
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900" role="status">
        Live statistics are temporarily unavailable. You can still use the navigation below.
      </div>
    );
  }
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="w-full flex-1 bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 py-9 text-white shadow-xl sm:px-10 sm:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-36 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100">
              RESOURCE RESERVATION MANAGEMENT
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
              Welcome to your dashboard
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-blue-100 sm:text-base">
              Manage meeting rooms, equipment and other resources. Check availability,
              create reservations and follow bookings in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/reservations" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                Manage reservations <ArrowIcon />
              </Link>
              <Link href="/resources" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                Manage resources <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="overview-title" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Overview</p>
              <h2 id="overview-title" className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Live system summary</h2>
            </div>
            <span className="text-xs text-slate-500">Sri Lanka Time (UTC+05:30)</span>
          </div>
          <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading live statistics…</div>}>
            <DashboardMetrics />
          </Suspense>
        </section>

        <section aria-labelledby="management-title" className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Quick access</p>
            <h2 id="management-title" className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Management modules</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Link href="/resources" className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-700" aria-hidden="true">▦</span>
              <h3 className="mt-5 text-xl font-bold text-slate-900">Resource Management</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                Register rooms and equipment, update resource details, manage capacities, and activate or deactivate resources.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 group-hover:gap-3">
                Open Resources <ArrowIcon />
              </span>
            </Link>
            <Link href="/reservations" className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700" aria-hidden="true">▣</span>
              <h3 className="mt-5 text-xl font-bold text-slate-900">Reservation Management</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                Check available time slots, book resources, view reservation history, reschedule bookings and cancel future reservations.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 group-hover:gap-3">
                Open Reservations <ArrowIcon />
              </span>
            </Link>
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-slate-400">
          RRMS · Internal resource scheduling workspace
        </p>
      </div>
    </main>
  );
}
