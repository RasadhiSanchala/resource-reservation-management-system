import { Suspense } from "react";
import { connection } from "next/server";

import { ReservationManagement } from "@/features/reservations/components/reservation-management";
import { listReservations } from "@/features/reservations/services/reservation-query.service";
import type { ReservationView } from "@/features/reservations/types/reservation-view.type";
import { listResources } from "@/features/resources/services/resource.service";
import type { ResourceView } from "@/features/resources/types/resource-view.type";

// Capture request time once on the server.
function getRequestTimeIso() {
  return new Date().toISOString();
}

async function ReservationsContent() {
  // Required with cacheComponents enabled: read fresh data per request.
  await connection();

  const [dbResources, dbReservations] = await Promise.all([
    listResources(),
    listReservations(),
  ]);

  const resources: ResourceView[] = dbResources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    category: resource.category,
    location: resource.location,
    description: resource.description,
    capacity: resource.capacity,
    isActive: resource.isActive,
  }));

  const reservations: ReservationView[] = dbReservations.map((reservation) => ({
    id: reservation.id,
    resourceId: reservation.resourceId,
    requesterName: reservation.requesterName,
    team: reservation.team,
    purpose: reservation.purpose,
    attendeeCount: reservation.attendeeCount,
    startAt: reservation.startAt.toISOString(),
    endAt: reservation.endAt.toISOString(),
    status: reservation.status,
    createdAt: reservation.createdAt.toISOString(),
    cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
    resource: {
      id: reservation.resource.id,
      name: reservation.resource.name,
      category: reservation.resource.category,
      location: reservation.resource.location,
      capacity: reservation.resource.capacity,
      isActive: reservation.resource.isActive,
    },
  }));

  const serverNowIso = getRequestTimeIso();

  return (
    <ReservationManagement
      resources={resources}
      reservations={reservations}
      serverNowIso={serverNowIso}
    />
  );
}

export default function ReservationsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
          Loading reservations...
        </main>
      }
    >
      <ReservationsContent />
    </Suspense>
  );
}
