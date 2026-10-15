
import { z } from "zod";

import { prisma } from "@/lib/prisma";

// Reservation list filtering rules.
export const reservationListFilterSchema = z
    .strictObject({
        resourceId: z.uuid("Invalid resource ID").optional(),

        status: z
            .enum(["CONFIRMED", "CANCELLED"])
            .optional(),

        // ISO timestamps with timezone information.
        from: z.iso.datetime({ offset: true }).optional(),
        to: z.iso.datetime({ offset: true }).optional(),
    })
    .superRefine((data, context) => {
        // A date-range filter must contain both boundaries.
        if ((data.from === undefined) !== (data.to === undefined)) {
            context.addIssue({
                code: "custom",
                message: "Both date range boundaries are required.",
                path: ["from"],
            });

            return;
        }

        if (data.from && data.to) {
            if (
                new Date(data.from).getTime() >=
                new Date(data.to).getTime()
            ) {
                context.addIssue({
                    code: "custom",
                    message: "Date range end must be after start.",
                    path: ["to"],
                });
            }
        }
    });

export type ReservationListFilters = z.infer<
    typeof reservationListFilterSchema
>;

const reservationIdSchema = z.uuid(
    "Invalid reservation ID",
);

/**
 * LIST RESERVATIONS
 *
 * Supports:
 * - All reservations
 * - Filtering by resource
 * - Filtering by status
 * - Filtering by overlapping date/time range
 *
 * Cancelled reservations remain visible.
 */
export async function listReservations(
    input: unknown = {},
) {
    // Step 1: Validate filters.
    const filters = reservationListFilterSchema.parse(input);

    // Step 2: Build database query conditions.
    const where = {
        ...(filters.resourceId && {
            resourceId: filters.resourceId,
        }),

        ...(filters.status && {
            status: filters.status,
        }),

        ...(filters.from &&
            filters.to && {
            // Include any reservation that overlaps
            // the selected [from, to) interval.
            startAt: {
                lt: new Date(filters.to),
            },

            endAt: {
                gt: new Date(filters.from),
            },
        }),
    };

    // Step 3: Retrieve reservations with resource details.
    return prisma.reservation.findMany({
        where,

        include: {
            resource: {
                select: {
                    id: true,
                    name: true,
                    category: true,
                    location: true,
                    capacity: true,
                    isActive: true,
                },
            },
        },

        orderBy: [
            { startAt: "asc" },
            { id: "asc" },
        ],
    });
}

/**
 * GET RESERVATION BY ID
 *
 * Returns one reservation and its resource details.
 * Returns null when a valid UUID is not found.
 */
export async function getReservationById(id: string) {
    const reservationId = reservationIdSchema.parse(id);

    return prisma.reservation.findUnique({
        where: {
            id: reservationId,
        },

        include: {
            resource: {
                select: {
                    id: true,
                    name: true,
                    category: true,
                    location: true,
                    capacity: true,
                    isActive: true,
                },
            },
        },
    });
}
