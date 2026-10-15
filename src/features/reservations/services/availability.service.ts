
import { prisma } from "@/lib/prisma";

import { checkAvailabilitySchema } from "../schemas/reservation.schema";

import { ReservationBusinessError } from "./reservation.service";

/**
 * CHECK RESOURCE AVAILABILITY
 *
 * Checks whether an active resource can be
 * reserved for the requested future interval.
 *
 * This is a read-only availability preview.
 * Final validation must always happen again
 * when the reservation is created.
 */
export async function checkResourceAvailability(
    input: unknown,
) {
    // Step 1: Validate input.
    const data = checkAvailabilitySchema.parse(input);

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    // Step 2: Retrieve resource details.
    const resource = await prisma.resource.findUnique({
        where: {
            id: data.resourceId,
        },

        select: {
            id: true,
            name: true,
            isActive: true,
            capacity: true,
        },
    });

    if (!resource) {
        throw new ReservationBusinessError(
            "RESOURCE_NOT_FOUND",
            "Selected resource was not found.",
        );
    }

    // Step 3: Check whether resource is active.
    if (!resource.isActive) {
        throw new ReservationBusinessError(
            "RESOURCE_INACTIVE",
            "This resource is inactive and cannot be booked.",
        );
    }

    // Step 4: Validate attendee count.
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

    // Recheck trusted server time.
    if (startAt.getTime() <= Date.now()) {
        throw new ReservationBusinessError(
            "START_TIME_PASSED",
            "Reservation start time must be in the future.",
        );
    }

    // Step 5: Find overlapping confirmed reservations.
    //
    // Overlap:
    // existing.startAt < requested.endAt
    // AND existing.endAt > requested.startAt
    //
    // Cancelled reservations are ignored.
    const conflicts = await prisma.reservation.findMany({
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
            startAt: true,
            endAt: true,
        },

        orderBy: {
            startAt: "asc",
        },
    });

    // Step 6: Return availability preview.
    return {
        resourceId: resource.id,
        resourceName: resource.name,

        isAvailable: conflicts.length === 0,

        startAt,
        endAt,

        conflictingReservations: conflicts,
    };
}
