"use client";

import Link from "next/link";
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
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";
const labelClass = "block text-sm font-medium text-slate-700";
const primaryButton =
  "rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
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
      className={`rounded-lg border px-4 py-3 text-sm ${
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Resource Reservation Management System</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Reservations & Availability</h1>
            <p className="mt-1 text-sm text-slate-600">All times shown and entered in Sri Lanka Time (UTC+05:30).</p>
          </div>
          <Link href="/resources" className={secondaryButton}>Manage Resources</Link>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total reservations", value: reservations.length },
            { label: "Upcoming confirmed", value: upcomingCount },
            { label: "Cancelled / history", value: cancelledCount },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">{item.label}</p>
              <p className="mt-2 text-3xl font-bold">{item.value}</p>
            </div>
          ))}
        </div>

        <FeedbackMessage feedback={feedback} />

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="create-reservation-heading">
          <div className="mb-5">
            <h2 id="create-reservation-heading" className="text-xl font-bold">Create New Reservation</h2>
            <p className="mt-1 text-sm text-slate-600">Check availability, then confirm the booking. Availability can change before submission.</p>
          </div>
          {activeResources.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No active resources available. <Link href="/resources" className="font-semibold underline">Create or activate a resource first.</Link>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className={labelClass}>
                  Resource <span className="text-red-600">*</span>
                  <select value={resourceId} disabled={!!busy} onChange={(e) => { setResourceId(e.target.value); resetAvailability(); }} required className={inputClass}>
                    {activeResources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} — {resource.location}{resource.capacity === null ? "" : ` (capacity ${resource.capacity})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Requester Name <span className="text-red-600">*</span>
                  <input className={inputClass} value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required maxLength={120} placeholder="e.g. Nimal Perera" disabled={!!busy} />
                </label>
                <label className={labelClass}>
                  Attendee Count (optional)
                  <input className={inputClass} type="number" min={1} step={1} value={attendeeCount} onChange={(e) => { setAttendeeCount(e.target.value); resetAvailability(); }} placeholder="e.g. 5" disabled={!!busy} />
                </label>
                <label className={labelClass}>
                  Start (Sri Lanka Time) <span className="text-red-600">*</span>
                  <input className={inputClass} type="datetime-local" value={startLocal} onChange={(e) => { setStartLocal(e.target.value); resetAvailability(); }} required disabled={!!busy} />
                </label>
                <label className={labelClass}>
                  End (Sri Lanka Time) <span className="text-red-600">*</span>
                  <input className={inputClass} type="datetime-local" value={endLocal} onChange={(e) => { setEndLocal(e.target.value); resetAvailability(); }} required disabled={!!busy} />
                </label>
                <label className={labelClass}>
                  Team (optional)
                  <input className={inputClass} value={team} onChange={(e) => setTeam(e.target.value)} maxLength={120} placeholder="e.g. Engineering" disabled={!!busy} />
                </label>
              </div>
              <label className={labelClass}>
                Purpose (optional)
                <textarea className={inputClass} rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder="Meeting purpose" disabled={!!busy} />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleAvailability} disabled={!!busy || !resourceId || !startLocal || !endLocal} className={secondaryButton}>
                  {busy === "availability" ? "Checking..." : "Check Availability"}
                </button>
                <button type="submit" disabled={!!busy || !resourceId} className={primaryButton}>
                  {busy === "create" ? "Creating..." : "Create Reservation"}
                </button>
              </div>
              {availabilityResult && (
                <div role="status" className={`rounded-lg border p-4 text-sm ${
                  availabilityResult.success && availabilityResult.availability.isAvailable
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}>
                  <p className="font-semibold">{availabilityResult.message}</p>
                  {availabilityResult.success && availabilityResult.availability.conflictingReservations.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p>Conflicting confirmed bookings:</p>
                      {availabilityResult.availability.conflictingReservations.map((conflict) => (
                        <p key={conflict.id}>{formatSriLanka(conflict.startAt)} – {formatSriLanka(conflict.endAt)}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </section>

        {rescheduling && (
          <section id="reschedule-panel" className="rounded-xl border-2 border-blue-300 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold">Reschedule Reservation</h2>
            <p className="mt-1 text-sm text-slate-600">{rescheduling.requesterName} — {rescheduling.resource.name}</p>
            <form onSubmit={handleReschedule} className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className={labelClass}>
                  New Resource
                  <select className={inputClass} value={newResourceId} required disabled={!!busy} onChange={(e) => setNewResourceId(e.target.value)}>
                    {activeResources.map((resource) => (
                      <option key={resource.id} value={resource.id}>{resource.name} — {resource.location}</option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  New Start (Sri Lanka Time)
                  <input className={inputClass} type="datetime-local" value={newStartLocal} required disabled={!!busy} onChange={(e) => setNewStartLocal(e.target.value)} />
                </label>
                <label className={labelClass}>
                  New End (Sri Lanka Time)
                  <input className={inputClass} type="datetime-local" value={newEndLocal} required disabled={!!busy} onChange={(e) => setNewEndLocal(e.target.value)} />
                </label>
              </div>
              <div className="flex gap-3">
                <button type="submit" className={primaryButton} disabled={!!busy || !newResourceId}>{busy === "reschedule" ? "Saving..." : "Save Reschedule"}</button>
                <button type="button" className={secondaryButton} disabled={!!busy} onClick={() => setRescheduling(null)}>Close</button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="reservation-list-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="reservation-list-heading" className="text-xl font-bold">Reservation List & History</h2>
              <p className="mt-1 text-sm text-slate-600">{filtered.length} matching reservations · {confirmedCount} confirmed total</p>
            </div>
            <button className={secondaryButton} onClick={() => router.refresh()} type="button" disabled={!!busy}>Refresh</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={labelClass}>
              Resource
              <select className={inputClass} value={filterResource} onChange={(e) => setFilterResource(e.target.value)}>
                <option value="ALL">All resources</option>
                {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} — {resource.location}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              Status
              <select className={inputClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ReservationStatusFilter)}>
                <option value="ALL">All statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className={labelClass}>
              Date (Sri Lanka Time)
              <input className={inputClass} type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            </label>
            <label className={labelClass}>
              Search
              <input className={inputClass} type="search" placeholder="Name, room, team, purpose" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">
              {reservations.length === 0
                ? "No reservations yet. Create the first booking above."
                : "No reservations match the selected filters."}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filtered.map((reservation) => {
                const canModify = reservation.status === "CONFIRMED" && new Date(reservation.startAt).getTime() > nowMs;
                return (
                  <article key={reservation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{reservation.resource.name}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${reservation.status === "CONFIRMED" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
                            {reservation.status}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{timingLabel(reservation, nowMs)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{reservation.resource.location} · Requested by {reservation.requesterName}</p>
                        <p className="mt-2 text-sm font-medium">{formatSriLanka(reservation.startAt)} → {formatSriLanka(reservation.endAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">{[
                          reservation.team ? `Team: ${reservation.team}` : "",
                          reservation.attendeeCount !== null ? `Attendees: ${reservation.attendeeCount}` : "",
                          reservation.purpose ? `Purpose: ${reservation.purpose}` : "",
                        ].filter(Boolean).join(" · ") || "No additional details"}</p>
                        {reservation.cancelledAt && <p className="mt-1 text-xs text-slate-500">Cancelled: {formatSriLanka(reservation.cancelledAt)}</p>}
                      </div>
                      {canModify && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={secondaryButton} disabled={!!busy} onClick={() => beginReschedule(reservation)}>Reschedule</button>
                          <button type="button" className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={!!busy} onClick={() => handleCancel(reservation)}>
                            {busy === reservation.id ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
