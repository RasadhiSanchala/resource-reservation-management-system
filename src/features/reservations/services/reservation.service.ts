
import { prisma } from "@/lib/prisma";

import { createReservationSchema } from "../schemas/reservation.schema";


export type ReservationErrorCode =
    | "RESOURCE_NOT_FOUND"
    | "RESOURCE_INACTIVE"
    | "CAPACITY_EXCEEDED"
    | "TIME_CONFLICT"
    | "START_TIME_PASSED"
    | "RESERVATION_NOT_FOUND"
    | "RESERVATION_NOT_CONFIRMED"
    | "RESERVATION_ALREADY_STARTED";


export class ReservationBusinessError extends Error {
    constructor(
        public readonly code: ReservationErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "ReservationBusinessError";
    }
}

// Detect a PostgreSQL exclusion-constraint violation.
// The unique reservation interval rule is enforced
// by the database even for concurrent requests.
export function isBookingExclusionError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }

    const dbError = error as {
        code?: unknown;
        constraint?: unknown;
        message?: unknown;
        meta?: unknown;
        cause?: unknown;
    };

    if (
        dbError.code === "23P01" ||
        dbError.constraint === "reservation_no_overlapping_confirmed"
    ) {
        return true;
    }

    if (
        typeof dbError.message === "string" &&
        dbError.message.includes(
            "reservation_no_overlapping_confirmed",
        )
    ) {
        return true;
    }

    if (
        typeof dbError.meta === "object" &&
        dbError.meta !== null
    ) {
        const meta = dbError.meta as {
            code?: unknown;
            database_error?: unknown;
            constraint?: unknown;
        };

        if (
            meta.code === "23P01" ||
            meta.constraint === "reservation_no_overlapping_confirmed" ||
            (typeof meta.database_error === "string" &&
                meta.database_error.includes(
                    "reservation_no_overlapping_confirmed",
                ))
        ) {
            return true;
        }
    }

    if (dbError.cause) {
        return isBookingExclusionError(dbError.cause);
    }

    return false;
}

/**
 * CREATE RESERVATION
 *
 * Business rules:
 * - Validate reservation input.
 * - Require a future start time.
 * - Book only existing active resources.
 * - Validate attendee count against capacity.
 * - Prevent overlapping confirmed bookings.
 * - Use resource row locking to coordinate
 *   with activation, deactivation and updates.
 * - Preserve PostgreSQL as the final authority
 *   for concurrent booking conflicts.
 */
export async function createReservation(input: unknown) {
    // Step 1: Validate all input fields.
    const data = createReservationSchema.parse(input);

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    try {
        // Step 2: Start an atomic database transaction.
        return await prisma.$transaction(
            async (tx) => {
                // Step 3: Lock the resource row.
                //
                // Resource Management operations also
                // use SELECT ... FOR UPDATE on this row.
                const lockedRows = await tx.$queryRaw<
                    Array<{ id: string }>
                >`
          SELECT "id"
          FROM "Resource"
          WHERE "id" = ${data.resourceId}::uuid
          FOR UPDATE
        `;

                if (lockedRows.length === 0) {
                    throw new ReservationBusinessError(
                        "RESOURCE_NOT_FOUND",
                        "Selected resource was not found.",
                    );
                }

                // Step 4: Retrieve resource details
                // while holding the row lock.
                const resource =
                    await tx.resource.findUniqueOrThrow({
                        where: {
                            id: data.resourceId,
                        },
                    });

                // Recheck time using trusted server time.
                if (startAt.getTime() <= Date.now()) {
                    throw new ReservationBusinessError(
                        "START_TIME_PASSED",
                        "Reservation start time must be in the future.",
                    );
                }

                // Step 5: Prevent reservations on
                // inactive resources.
                if (!resource.isActive) {
                    throw new ReservationBusinessError(
                        "RESOURCE_INACTIVE",
                        "This resource is inactive and cannot be booked.",
                    );
                }

                // Step 6: Validate capacity.
                //
                // null capacity means no configured limit.
                if (
                    resource.capacity !== null &&
                    data.attendeeCount !== undefined &&
                    data.attendeeCount > resource.capacity
                ) {
                    throw new ReservationBusinessError(
                        "CAPACITY_EXCEEDED",
                        `This resource supports a maximum of ${resource.capacity} attendees.`,
                    );
                }

                // Step 7: Check for overlapping bookings.
                //
                // Overlap formula:
                // newStart < existingEnd
                // AND newEnd > existingStart
                //
                // Cancelled reservations do not block slots.
                const conflictingReservation =
                    await tx.reservation.findFirst({
                        where: {
                            resourceId: data.resourceId,
                            status: "CONFIRMED",

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

                if (conflictingReservation) {
                    throw new ReservationBusinessError(
                        "TIME_CONFLICT",
                        "This resource is already reserved for the selected time interval.",
                    );
                }

                // Step 8: Create confirmed reservation.
                //
                // Database exclusion constraint provides
                // an additional guarantee against overlaps.
                return tx.reservation.create({
                    data: {
                        resourceId: data.resourceId,
                        requesterName: data.requesterName,
                        team: data.team,
                        purpose: data.purpose,
                        attendeeCount: data.attendeeCount,
                        startAt,
                        endAt,
                        status: "CONFIRMED",
                    },
                });
            },
            {
                maxWait: 10000,
                timeout: 15000,
            },
        );
    } catch (error) {
        // Convert a PostgreSQL exclusion failure
        // into a meaningful business error.
        if (isBookingExclusionError(error)) {
            throw new ReservationBusinessError(
                "TIME_CONFLICT",
                "This resource is already reserved for the selected time interval.",
            );
        }

        // Preserve known business errors for actions.
        throw error;
    }
}
