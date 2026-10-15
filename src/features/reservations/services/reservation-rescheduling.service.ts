
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { rescheduleReservationSchema } from "../schemas/reservation.schema";

import {
    isBookingExclusionError,
    ReservationBusinessError,
} from "./reservation.service";

const reservationIdSchema = z.uuid("Invalid reservation ID");

/**
 * RESCHEDULE RESERVATION
 *
 * Rules:
 * - Only future CONFIRMED reservations can be changed.
 * - Keep the same reservation ID.
 * - Allow changing the resource and/or time interval.
 * - Validate target resource status and capacity.
 * - Reject overlapping confirmed reservations.
 * - Preserve the original booking if any step fails.
 */
export async function rescheduleReservation(
    id: string,
    input: unknown,
) {
    const reservationId = reservationIdSchema.parse(id);
    const data = rescheduleReservationSchema.parse(input);

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    try {
        return await prisma.$transaction(
            async (tx) => {
                // 1. Lock the reservation so cancellation and
                // rescheduling cannot modify it simultaneously.
                const lockedReservations = await tx.$queryRaw<
                    Array<{ id: string }>
                >`
          SELECT "id"
          FROM "Reservation"
          WHERE "id" = ${reservationId}::uuid
          FOR UPDATE
        `;

                if (lockedReservations.length === 0) {
                    throw new ReservationBusinessError(
                        "RESERVATION_NOT_FOUND",
                        "Reservation was not found.",
                    );
                }

                const existing =
                    await tx.reservation.findUniqueOrThrow({
                        where: { id: reservationId },
                    });

                // 2. Validate current reservation state.
                if (existing.status !== "CONFIRMED") {
                    throw new ReservationBusinessError(
                        "RESERVATION_NOT_CONFIRMED",
                        "Only confirmed reservations can be rescheduled.",
                    );
                }

                if (existing.startAt.getTime() <= Date.now()) {
                    throw new ReservationBusinessError(
                        "RESERVATION_ALREADY_STARTED",
                        "A reservation that has already started cannot be rescheduled.",
                    );
                }

                // 3. Select the destination resource.
                const targetResourceId =
                    data.resourceId ?? existing.resourceId;

                // Lock the source and destination resources.
                // Sorting IDs provides a consistent lock order
                // when moving bookings between resources.
                const resourceIds = [
                    ...new Set([
                        existing.resourceId,
                        targetResourceId,
                    ]),
                ].sort();

                for (const resourceId of resourceIds) {
                    const lockedResources = await tx.$queryRaw<
                        Array<{ id: string }>
                    >`
            SELECT "id"
            FROM "Resource"
            WHERE "id" = ${resourceId}::uuid
            FOR UPDATE
          `;

                    if (lockedResources.length === 0) {
                        throw new ReservationBusinessError(
                            "RESOURCE_NOT_FOUND",
                            "Selected resource was not found.",
                        );
                    }
                }

                // 4. Read the destination resource.
                const resource =
                    await tx.resource.findUniqueOrThrow({
                        where: { id: targetResourceId },
                    });

                // Recheck time after acquiring locks.
                if (startAt.getTime() <= Date.now()) {
                    throw new ReservationBusinessError(
                        "START_TIME_PASSED",
                        "New reservation start time must be in the future.",
                    );
                }

                if (!resource.isActive) {
                    throw new ReservationBusinessError(
                        "RESOURCE_INACTIVE",
                        "The selected resource is inactive.",
                    );
                }

                // Existing attendee count remains unchanged.
                if (
                    resource.capacity !== null &&
                    existing.attendeeCount !== null &&
                    existing.attendeeCount > resource.capacity
                ) {
                    throw new ReservationBusinessError(
                        "CAPACITY_EXCEEDED",
                        `The selected resource supports a maximum of ${resource.capacity} attendees.`,
                    );
                }

                // 5. Check overlapping confirmed reservations.
                //
                // Exclude this reservation's own ID so it
                // does not conflict with itself.
                const conflict =
                    await tx.reservation.findFirst({
                        where: {
                            resourceId: targetResourceId,
                            status: "CONFIRMED",

                            id: {
                                not: reservationId,
                            },

                            startAt: {
                                lt: endAt,
                            },

                            endAt: {
                                gt: startAt,
                            },
                        },

                        select: {
                            id: true,
                        },
                    });

                if (conflict) {
                    throw new ReservationBusinessError(
                        "TIME_CONFLICT",
                        "The selected resource is already reserved for this time interval.",
                    );
                }

                // 6. Update the same reservation record.
                // If PostgreSQL rejects the update, the
                // transaction rolls back automatically.
                return tx.reservation.update({
                    where: {
                        id: reservationId,
                    },

                    data: {
                        resourceId: targetResourceId,
                        startAt,
                        endAt,
                    },
                });
            },
            {
                maxWait: 10000,
                timeout: 15000,
            },
        );
    } catch (error) {
        if (isBookingExclusionError(error)) {
            throw new ReservationBusinessError(
                "TIME_CONFLICT",
                "The selected resource is already reserved for this time interval.",
            );
        }

        throw error;
    }
}
