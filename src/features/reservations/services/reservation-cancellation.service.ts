
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { ReservationBusinessError } from "./reservation.service";

// Validate reservation IDs.
const reservationIdSchema = z.uuid("Invalid reservation ID");

/**
 * CANCEL RESERVATION
 *
 * Business rules:
 *
 * 1. Reservation must exist.
 * 2. Only CONFIRMED reservations can be cancelled.
 * 3. Reservation must not have started.
 * 4. Cancellation preserves the original record.
 * 5. Cancelled bookings no longer block availability.
 * 6. Concurrent cancellation attempts cannot both succeed.
 */
export async function cancelReservation(id: string) {
    // Step 1: Validate reservation ID.
    const reservationId = reservationIdSchema.parse(id);

    // Step 2: Execute cancellation atomically.
    return prisma.$transaction(
        async (tx) => {
            // Lock the reservation row.
            // This serializes concurrent cancellation attempts.
            const lockedRows = await tx.$queryRaw<
                Array<{ id: string }>
            >`
        SELECT "id"
        FROM "Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE
      `;

            if (lockedRows.length === 0) {
                throw new ReservationBusinessError(
                    "RESERVATION_NOT_FOUND",
                    "Reservation was not found.",
                );
            }

            // Step 3: Retrieve the current reservation state
            // after acquiring the lock.
            const reservation =
                await tx.reservation.findUniqueOrThrow({
                    where: {
                        id: reservationId,
                    },
                });

            // Step 4: Prevent repeated cancellation.
            if (reservation.status !== "CONFIRMED") {
                throw new ReservationBusinessError(
                    "RESERVATION_NOT_CONFIRMED",
                    "Only confirmed reservations can be cancelled.",
                );
            }

            // Step 5: Allow cancellation only before
            // the reservation has started.
            if (reservation.startAt.getTime() <= Date.now()) {
                throw new ReservationBusinessError(
                    "RESERVATION_ALREADY_STARTED",
                    "A reservation that has already started cannot be cancelled.",
                );
            }

            // Step 6: Preserve the reservation and update status.
            //
            // PostgreSQL's exclusion constraint applies
            // only to CONFIRMED reservations.
            //
            // Changing the status to CANCELLED
            // releases the occupied time interval.
            return tx.reservation.update({
                where: {
                    id: reservationId,
                },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                },
            });
        },
        {
            maxWait: 10000,
            timeout: 15000,
        },
    );
}
