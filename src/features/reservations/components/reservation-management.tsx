"use client";

import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { ResourceView } from "@/features/resources/types/resource-view.type";
import {
  cancelReservationAction,
  checkAvailabilityAction,
  createReservationAction,
  rescheduleReservationAction,
} from "../actions/reservation.actions";
import type { ReservationView } from "../types/reservation-view.type";

type Props = {
  resources: ResourceView[];
  reservations: ReservationView[];
  serverNowIso: string;
};

type Feedback = { success: boolean; message: string };
type AvailabilityResult = Awaited<ReturnType<typeof checkAvailabilityAction>>;
type ReservationStatusFilter = "ALL" | "CONFIRMED" | "CANCELLED";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";
const labelClass = "block text-xs font-bold text-slate-700";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonSmall =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50";
const dangerButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50";
const zone = "Asia/Colombo";
const offsetMs = 330 * 60 * 1000;

// datetime-local does not include a timezone. Interpret it explicitly as
// Sri Lanka Time, irrespective of the computer/browser timezone.
function toUtcIso(localDateTime: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) {
    throw new Error("Please select a valid date and time.");
  }

  const date = new Date(`${localDateTime}:00+05:30`);
  if (
    !Number.isFinite(date.getTime()) ||
    toSriLankaInput(date.toISOString()) !== localDateTime
  ) {
    throw new Error("Please select a valid Sri Lanka date and time.");
  }
  return date.toISOString();
}

function toSriLankaInput(utcIso: string): string {
  const timestamp = new Date(utcIso).getTime();
  return new Date(timestamp + offsetMs).toISOString().slice(0, 16);
}

function formatSriLanka(utcIso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(utcIso));
}

function timingLabel(reservation: ReservationView, nowMs: number): string {
  if (reservation.status === "CANCELLED") return "Cancelled";
  if (new Date(reservation.startAt).getTime() > nowMs) return "Upcoming";
  if (new Date(reservation.endAt).getTime() > nowMs) return "Ongoing";
  return "Completed";
}

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm ${
        feedback.success
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {feedback.message}
    </div>
  );
}

export function ReservationManagement({ resources, reservations, serverNowIso }: Props) {
  // Stable server-provided reference time for deterministic render.
  const nowMs = new Date(serverNowIso).getTime();
  const router = useRouter();
  const activeResources = resources.filter((resource) => resource.isActive);
  const [resourceId, setResourceId] = useState(activeResources[0]?.id ?? "");
  const [requesterName, setRequesterName] = useState("");
  const [team, setTeam] = useState("");
  const [purpose, setPurpose] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [availabilityResult, setAvailabilityResult] =
    useState<AvailabilityResult | null>(null);

  const [filterResource, setFilterResource] = useState("ALL");
  const [filterStatus, setFilterStatus] =
    useState<ReservationStatusFilter>("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");

  const [rescheduling, setRescheduling] = useState<ReservationView | null>(null);
  const [newResourceId, setNewResourceId] = useState("");
  const [newStartLocal, setNewStartLocal] = useState("");
  const [newEndLocal, setNewEndLocal] = useState("");

  const confirmedCount = reservations.filter((r) => r.status === "CONFIRMED").length;
  const cancelledCount = reservations.length - confirmedCount;
  const upcomingCount = reservations.filter(
    (r) => r.status === "CONFIRMED" && new Date(r.startAt).getTime() > nowMs,
  ).length;

  const filtered = reservations.filter((r) => {
    if (filterResource !== "ALL" && r.resourceId !== filterResource) return false;
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    const needle = search.trim().toLowerCase();
    if (
      needle &&
      ![r.requesterName, r.team ?? "", r.purpose ?? "", r.resource.name]
        .some((value) => value.toLowerCase().includes(needle))
    ) {
      return false;
    }
    if (filterDate) {
      const dayStart = new Date(`${filterDate}T00:00:00+05:30`).getTime();
      if (!Number.isFinite(dayStart)) return false;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      // Show bookings overlapping the selected Sri Lanka calendar day.
      if (
        new Date(r.startAt).getTime() >= dayEnd ||
        new Date(r.endAt).getTime() <= dayStart
      ) {
        return false;
      }
    }
    return true;
  });

  function resetAvailability() {
    setAvailabilityResult(null);
    setFeedback(null);
  }

  function bookingInput() {
    if (!resourceId) throw new Error("Select an active resource first.");
    return {
      resourceId,
      requesterName,
      team,
      purpose,
      attendeeCount: attendeeCount.trim() ? Number(attendeeCount) : undefined,
      startAt: toUtcIso(startLocal),
      endAt: toUtcIso(endLocal),
    };
  }

  async function handleAvailability() {
    if (busy) return;
    setBusy("availability");
    setAvailabilityResult(null);
    setFeedback(null);
    try {
      const input = bookingInput();
      const result = await checkAvailabilityAction({
        resourceId: input.resourceId,
        startAt: input.startAt,
        endAt: input.endAt,
        attendeeCount: input.attendeeCount,
      });
      setAvailabilityResult(result);
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "Invalid date and time." });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    setFeedback(null);
    setAvailabilityResult(null);
    try {
      const result = await createReservationAction(bookingInput());
      setFeedback(result);
      if (result.success) {
        setRequesterName("");
        setTeam("");
        setPurpose("");
        setAttendeeCount("");
        setStartLocal("");
        setEndLocal("");
        router.refresh();
      }
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "Could not create reservation." });
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(reservation: ReservationView) {
    if (busy) return;
    if (!window.confirm(`Cancel ${reservation.requesterName}'s booking for ${reservation.resource.name}?`)) return;
    setBusy(reservation.id);
    setFeedback(null);
    try {
      const result = await cancelReservationAction(reservation.id);
      setFeedback(result);
      if (result.success) {
        if (rescheduling?.id === reservation.id) setRescheduling(null);
        router.refresh();
      }
    } catch {
      setFeedback({ success: false, message: "Unable to cancel the reservation." });
    } finally {
      setBusy(null);
    }
  }

  function beginReschedule(reservation: ReservationView) {
    if (busy) return;
    setRescheduling(reservation);
    setNewResourceId(reservation.resourceId);
    setNewStartLocal(toSriLankaInput(reservation.startAt));
    setNewEndLocal(toSriLankaInput(reservation.endAt));
    setFeedback(null);
    requestAnimationFrame(() => {
      document.getElementById("reschedule-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !rescheduling) return;
    setBusy("reschedule");
    setFeedback(null);
    try {
      const result = await rescheduleReservationAction(rescheduling.id, {
        resourceId: newResourceId,
        startAt: toUtcIso(newStartLocal),
        endAt: toUtcIso(newEndLocal),
      });
      setFeedback(result);
      if (result.success) {
        setRescheduling(null);
        router.refresh();
      }
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "Invalid date and time." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen flex-1 bg-[#f5f7fc] text-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0b1a35] via-[#122c58] to-[#1846a2] p-6 text-white shadow-[0_18px_48px_-26px_rgba(22,53,122,.65)] sm:p-9">
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-32 h-60 w-60 rounded-full bg-sky-400/10 blur-2xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-blue-100"><WorkspaceIcon name="calendar-check" size={14} /> Booking workspace</span>
              <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-[40px]">A better way to book your day.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-blue-100/90 sm:text-base">Find open time slots, secure a resource and keep every reservation organized, without double bookings.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100"><WorkspaceIcon name="clock" size={15} /> All times in Sri Lanka (UTC+05:30)</div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/resources" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"><WorkspaceIcon name="layers" size={17} /> Resources</Link>
              <button type="button" onClick={() => document.getElementById("new-reservation")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-blue-50"><WorkspaceIcon name="plus" size={17} /> New booking</button>
            </div>
          </div>
        </header>

        <section aria-label="Reservation statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "All reservations", value: reservations.length, helper: "Bookings on record", icon: "calendar" as const, accent: "bg-blue-50 text-blue-700" },
            { label: "Confirmed", value: confirmedCount, helper: "Active booking records", icon: "check-circle" as const, accent: "bg-emerald-50 text-emerald-700" },
            { label: "Upcoming", value: upcomingCount, helper: "Confirmed, future bookings", icon: "clock" as const, accent: "bg-violet-50 text-violet-700" },
            { label: "Cancelled", value: cancelledCount, helper: "History is always preserved", icon: "archive" as const, accent: "bg-amber-50 text-amber-700" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(30,58,98,.035)]">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className="mt-2 text-3xl font-extrabold tracking-tight">{item.value}</p></div>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.accent}`}><WorkspaceIcon name={item.icon} size={21} /></span>
              </div>
              <p className="mt-3 text-xs text-slate-400">{item.helper}</p>
            </div>
          ))}
        </section>

        <FeedbackMessage feedback={feedback} />

        {rescheduling && (
          <section id="reschedule-panel" aria-labelledby="reschedule-heading" className="scroll-mt-24 overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-[0_8px_35px_rgba(37,99,235,.08)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-5 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white"><WorkspaceIcon name="repeat" size={21} /></span>
                <div><h2 id="reschedule-heading" className="text-xl font-extrabold text-slate-900">Reschedule booking</h2><p className="mt-1 text-sm text-slate-600">{rescheduling.requesterName} · {rescheduling.resource.name}</p></div>
              </div>
              <button type="button" disabled={!!busy} onClick={() => setRescheduling(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close</button>
            </div>
            <form onSubmit={handleReschedule} className="space-y-5 p-5 sm:p-7">
              <div className="grid gap-4 md:grid-cols-3">
                <label className={labelClass}>Resource
                  <select className={inputClass} value={newResourceId} required disabled={!!busy} onChange={(e) => setNewResourceId(e.target.value)}>{activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} — {resource.location}</option>)}</select>
                </label>
                <label className={labelClass}>New start · Sri Lanka Time
                  <input className={inputClass} type="datetime-local" value={newStartLocal} required disabled={!!busy} onChange={(e) => setNewStartLocal(e.target.value)} />
                </label>
                <label className={labelClass}>New end · Sri Lanka Time
                  <input className={inputClass} type="datetime-local" value={newEndLocal} required disabled={!!busy} onChange={(e) => setNewEndLocal(e.target.value)} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={primaryButton} disabled={!!busy || !newResourceId}><WorkspaceIcon name="check" size={17} />{busy === "reschedule" ? "Saving changes..." : "Save reschedule"}</button>
                <p className="text-xs text-slate-500">The booking keeps its original reservation ID.</p>
              </div>
            </form>
          </section>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(275px,.8fr)]">
          <section id="new-reservation" aria-labelledby="create-reservation-heading" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white px-5 py-5 sm:px-7">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white"><WorkspaceIcon name="plus" size={21} /></span>
              <div><p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700">Create a booking</p><h2 id="create-reservation-heading" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">New reservation</h2><p className="mt-1 text-sm leading-6 text-slate-500">Choose a resource and time, then check availability before booking.</p></div>
            </div>
            {activeResources.length === 0 ? (
              <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 sm:m-7"><div className="flex items-start gap-3"><WorkspaceIcon name="alert" size={20} className="mt-0.5 shrink-0" /><div><p className="font-bold">No active resources available</p><p className="mt-1"> <Link href="/resources" className="font-bold underline">Create or activate a resource</Link> before making a reservation.</p></div></div></div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-5 p-5 sm:p-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={`${labelClass} sm:col-span-2`}>Resource <span className="text-rose-600">*</span>
                    <select value={resourceId} disabled={!!busy} onChange={(e) => { setResourceId(e.target.value); resetAvailability(); }} required className={inputClass}>
                      {activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} — {resource.location}{resource.capacity === null ? "" : ` (capacity ${resource.capacity})`}</option>)}
                    </select>
                  </label>
                  <label className={labelClass}>Requested by <span className="text-rose-600">*</span>
                    <input className={inputClass} value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required maxLength={120} placeholder="Full name" disabled={!!busy} />
                  </label>
                  <label className={labelClass}>Team <span className="font-normal text-slate-400">(optional)</span>
                    <input className={inputClass} value={team} onChange={(e) => setTeam(e.target.value)} maxLength={120} placeholder="e.g. Engineering" disabled={!!busy} />
                  </label>
                  <label className={labelClass}>Starts at <span className="text-rose-600">*</span>
                    <input className={inputClass} type="datetime-local" value={startLocal} onChange={(e) => { setStartLocal(e.target.value); resetAvailability(); }} required disabled={!!busy} />
                  </label>
                  <label className={labelClass}>Ends at <span className="text-rose-600">*</span>
                    <input className={inputClass} type="datetime-local" value={endLocal} onChange={(e) => { setEndLocal(e.target.value); resetAvailability(); }} required disabled={!!busy} />
                  </label>
                  <label className={labelClass}>Attendees <span className="font-normal text-slate-400">(optional)</span>
                    <input className={inputClass} type="number" min={1} step={1} value={attendeeCount} onChange={(e) => { setAttendeeCount(e.target.value); resetAvailability(); }} placeholder="e.g. 5" disabled={!!busy} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>Purpose <span className="font-normal text-slate-400">(optional)</span>
                    <textarea className={`${inputClass} resize-y`} rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder="What is this reservation for?" disabled={!!busy} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                  <button type="button" onClick={handleAvailability} disabled={!!busy || !resourceId || !startLocal || !endLocal} className={secondaryButton}><WorkspaceIcon name="search" size={17} />{busy === "availability" ? "Checking..." : "Check availability"}</button>
                  <button type="submit" disabled={!!busy || !resourceId} className={primaryButton}><WorkspaceIcon name="calendar-check" size={18} />{busy === "create" ? "Creating booking..." : "Confirm reservation"}</button>
                </div>
                {availabilityResult && (
                  <div role="status" aria-live="polite" className={`rounded-xl border px-4 py-4 text-sm ${availabilityResult.success && availabilityResult.availability.isAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    <div className="flex items-start gap-2.5"><WorkspaceIcon name={availabilityResult.success && availabilityResult.availability.isAvailable ? "check-circle" : "alert"} size={20} className="mt-0.5 shrink-0" /><div><p className="font-bold">{availabilityResult.message}</p>
                      {availabilityResult.success && availabilityResult.availability.conflictingReservations.length > 0 && (
                        <div className="mt-3 space-y-1 text-xs"><p className="font-semibold">Existing reservations in this time range:</p>{availabilityResult.availability.conflictingReservations.map((conflict) => <p key={conflict.id}>{formatSriLanka(conflict.startAt)} – {formatSriLanka(conflict.endAt)}</p>)}</div>
                      )}
                    </div></div>
                  </div>
                )}
              </form>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white"><WorkspaceIcon name="shield" size={22} /></span>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight">Book with confidence</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Every reservation is checked against the same resource&apos;s confirmed bookings.</p>
              <div className="mt-5 space-y-4">
                {[
                  { title: "Select a resource", detail: "Choose from active rooms or equipment." },
                  { title: "Check a time slot", detail: "See whether your dates overlap a booking." },
                  { title: "Confirm your booking", detail: "Availability is checked again when saving." },
                ].map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-blue-700 shadow-sm ring-1 ring-blue-100">{index + 1}</span><div><p className="text-sm font-bold text-slate-800">{step.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.detail}</p></div></div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><WorkspaceIcon name="info" size={19} className="text-blue-600" /> A quick reminder</div>
              <p className="mt-2 text-xs leading-6 text-slate-500">Cancelled bookings stay in history but no longer block their time slots. Rescheduling is available for future confirmed bookings.</p>
            </div>
          </aside>
        </div>

        <section aria-labelledby="reservation-list-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700"><WorkspaceIcon name="list" size={15} /> Booking directory</p><h2 id="reservation-list-heading" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Reservations & history</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} matching reservations · {confirmedCount} confirmed total</p></div>
              <button className={secondaryButton} onClick={() => router.refresh()} type="button" disabled={!!busy}><WorkspaceIcon name="refresh" size={16} /> Refresh</button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter by booking status">
              {(["ALL", "CONFIRMED", "CANCELLED"] as const).map((status) => (
                <button key={status} type="button" aria-pressed={filterStatus === status} onClick={() => setFilterStatus(status)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${filterStatus === status ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{status === "ALL" ? "All bookings" : status === "CONFIRMED" ? "Confirmed" : "Cancelled"}</button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="relative block"><span className="sr-only">Search reservations</span><WorkspaceIcon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} mt-0 pl-10`} type="search" placeholder="Search requester, team or resource..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label><span className="sr-only">Filter by resource</span><select className={`${inputClass} mt-0`} value={filterResource} onChange={(e) => setFilterResource(e.target.value)}><option value="ALL">All resources</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} — {resource.location}</option>)}</select></label>
              <label><span className="sr-only">Filter by Sri Lanka date</span><input aria-label="Filter by Sri Lanka calendar date" title="Filter by Sri Lanka calendar date" className={`${inputClass} mt-0`} type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></label>
            </div>
            {(filterStatus !== "ALL" || filterResource !== "ALL" || filterDate || search) && <button type="button" className="mt-3 text-xs font-bold text-blue-700 hover:underline" onClick={() => { setFilterStatus("ALL"); setFilterResource("ALL"); setFilterDate(""); setSearch(""); }}>Clear all filters</button>}
          </div>
          {filtered.length === 0 ? (
            <div className="mx-5 my-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-16 text-center sm:mx-7"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm"><WorkspaceIcon name="calendar" size={25} /></span><h3 className="mt-4 text-lg font-extrabold">{reservations.length === 0 ? "No bookings yet" : "No matching reservations"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{reservations.length === 0 ? "Create your first reservation using the form above." : "Try a different search term, resource or date filter."}</p></div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2 sm:p-7">
              {filtered.map((reservation) => {
                const canModify = reservation.status === "CONFIRMED" && new Date(reservation.startAt).getTime() > nowMs;
                const isCancelled = reservation.status === "CANCELLED";
                return (
                  <article key={reservation.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
                    <div className="flex-1 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-blue-700"><WorkspaceIcon name="calendar" size={14} /> Reservation</span>
                        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${isCancelled ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{reservation.status}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{timingLabel(reservation, nowMs)}</span></div>
                      </div>
                      <h3 className="mt-4 break-words text-lg font-extrabold tracking-tight text-slate-900">{reservation.resource.name}</h3>
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500"><WorkspaceIcon name="pin" size={15} className="shrink-0" />{reservation.resource.location}</p>
                      <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                        <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Starts</p><p className="mt-1 text-sm font-bold text-slate-800">{formatSriLanka(reservation.startAt)}</p></div>
                        <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ends</p><p className="mt-1 text-sm font-bold text-slate-800">{formatSriLanka(reservation.endAt)}</p></div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5"><WorkspaceIcon name="users" size={15} className="text-slate-400" />{reservation.requesterName}</span>{reservation.attendeeCount !== null && <span className="inline-flex items-center gap-1.5"><WorkspaceIcon name="users" size={15} className="text-slate-400" />{reservation.attendeeCount} attendees</span>}{reservation.team && <span className="inline-flex items-center gap-1.5"><WorkspaceIcon name="briefcase" size={15} className="text-slate-400" />{reservation.team}</span>}</div>
                      {reservation.purpose && <p className="mt-3 border-l-2 border-blue-200 pl-3 text-xs leading-5 text-slate-500">{reservation.purpose}</p>}
                      {reservation.cancelledAt && <p className="mt-3 text-[11px] text-slate-400">Cancelled on {formatSriLanka(reservation.cancelledAt)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
                      <span className="text-[11px] font-semibold text-slate-400">{canModify ? "Future booking · Manage below" : isCancelled ? "Cancelled booking" : "Read-only history"}</span>
                      {canModify && <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonSmall} disabled={!!busy} onClick={() => beginReschedule(reservation)}><WorkspaceIcon name="repeat" size={14} /> Reschedule</button><button type="button" className={dangerButton} disabled={!!busy} onClick={() => handleCancel(reservation)}><WorkspaceIcon name="x-circle" size={14} />{busy === reservation.id ? "Cancelling..." : "Cancel"}</button></div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <p className="pb-4 text-center text-xs text-slate-400">RRMS · Reservations and availability management</p>
      </div>
    </main>
  );
}
