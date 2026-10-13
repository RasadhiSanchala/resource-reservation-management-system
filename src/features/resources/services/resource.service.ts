
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import {
    createResourceSchema,
    updateResourceSchema,
    resourceStatusSchema,
} from "../schemas/resource.schema";

// Validate resource IDs before database queries.
const resourceIdSchema = z.string().uuid();

/**
 * CREATE RESOURCE
 *
 * Creates a new organizational resource.
 *
 * Business rules:
 * - Input must pass schema validation.
 * - New resources are active by default.
 * - PostgreSQL prevents duplicate normalized
 *   resource names within the same location.
 */
export async function createResource(input: unknown) {
    const data = createResourceSchema.parse(input);

    return prisma.resource.create({
        data: {
            name: data.name,
            category: data.category,
            location: data.location,
            description: data.description,
            capacity: data.capacity,
            isActive: true,
        },
    });
}

/**
 * LIST RESOURCES
 *
 * Retrieves all resources, including inactive ones.
 */
export async function listResources() {
    return prisma.resource.findMany({
        orderBy: [
            { createdAt: "desc" },
            { id: "asc" },
        ],
    });
}

/**
 * GET RESOURCE BY ID
 *
 * Retrieves a resource using its UUID.
 */
export async function getResourceById(id: string) {
    const resourceId = resourceIdSchema.parse(id);

    return prisma.resource.findUnique({
        where: {
            id: resourceId,
        },
    });
}

/**
 * UPDATE RESOURCE
 *
 * Business rules:
 *
 * 1. Validate the resource ID and update data.
 *
 * 2. Lock the resource row during the transaction.
 *
 * 3. Prevent a numeric capacity restriction that
 *    would invalidate an ongoing or future
 *    confirmed reservation.
 *
 * 4. Allow clearing optional capacity and
 *    description fields by saving null.
 *
 * 5. PostgreSQL rejects duplicate normalized
 *    resource names and locations.
 */
export async function updateResource(
    id: string,
    input: unknown,
) {
    // Step 1: Validate resource ID and input.
    const resourceId = resourceIdSchema.parse(id);
    const data = updateResourceSchema.parse(input);

    // Step 2: Perform update inside a transaction.
    return prisma.$transaction(async (tx) => {
        // Lock this resource row so concurrent resource
        // lifecycle operations cannot modify it
        // while the current update is being validated.
        const lockedRows = await tx.$queryRaw<
            Array<{ id: string }>
        >`
      SELECT "id"
      FROM "Resource"
      WHERE "id" = ${resourceId}::uuid
      FOR UPDATE
    `;

        if (lockedRows.length === 0) {
            throw new Error("Resource not found");
        }

        // Step 3: Retrieve the existing resource.
        const existingResource =
            await tx.resource.findUniqueOrThrow({
                where: {
                    id: resourceId,
                },
            });

        // Step 4: Determine whether the proposed numeric
        // capacity would introduce a capacity restriction.
        //
        // Examples:
        // 20 -> 10: Check confirmed reservations.
        // null -> 10: Check confirmed reservations.
        // 10 -> 20: No restriction; allow.
        // 10 -> null: Removes capacity limit; allow.
        //
        // null is treated as "no configured capacity limit".
        if (
            typeof data.capacity === "number" &&
            (existingResource.capacity === null ||
                data.capacity < existingResource.capacity)
        ) {
            const conflictingReservation =
                await tx.reservation.findFirst({
                    where: {
                        resourceId,
                        status: "CONFIRMED",

                        // Protect ongoing and future bookings.
                        endAt: {
                            gt: new Date(),
                        },

                        // Reject if a confirmed booking contains
                        // more attendees than the proposed capacity.
                        attendeeCount: {
                            gt: data.capacity,
                        },
                    },
                    select: {
                        id: true,
                    },
                });

            if (conflictingReservation) {
                throw new Error(
                    "Cannot reduce capacity because an ongoing or future confirmed reservation exceeds the proposed capacity.",
                );
            }
        }

        // Step 5: Update the resource.
        //
        // The update schema converts empty optional fields
        // into null, allowing existing values to be cleared.
        //
        // PostgreSQL's unique index will prevent
        // duplicate resource identities.
        return tx.resource.update({
            where: {
                id: resourceId,
            },
            data,
        });
    });
}

/**
 * ACTIVATE / DEACTIVATE RESOURCE
 *
 * Business rules:
 *
 * 1. Validate resource ID and requested status.
 *
 * 2. Lock the resource row before updating.
 *
 * 3. If the status is unchanged, return the resource.
 *
 * 4. Prevent deactivation when ongoing or future
 *    confirmed reservations exist.
 *
 * 5. Cancelled reservations do not block deactivation.
 *
 * 6. Preserve reservation history.
 */
export async function setResourceActiveStatus(
    id: string,
    input: unknown,
) {
    // Step 1: Validate resource ID and status.
    const resourceId = resourceIdSchema.parse(id);

    const { isActive } = resourceStatusSchema.parse(input);

    // Step 2: Execute inside a transaction.
    return prisma.$transaction(async (tx) => {
        // Lock the resource row while validating and
        // updating the resource lifecycle status.
        const lockedRows = await tx.$queryRaw<
            Array<{ id: string }>
        >`
      SELECT "id"
      FROM "Resource"
      WHERE "id" = ${resourceId}::uuid
      FOR UPDATE
    `;

        if (lockedRows.length === 0) {
            throw new Error("Resource not found");
        }

        // Step 3: Retrieve existing resource state.
        const resource = await tx.resource.findUniqueOrThrow({
            where: {
                id: resourceId,
            },
        });

        // Step 4: Do nothing if status is already correct.
        if (resource.isActive === isActive) {
            return resource;
        }

        // Step 5: Protect ongoing and future reservations
        // before allowing resource deactivation.
        if (!isActive) {
            const activeReservation =
                await tx.reservation.findFirst({
                    where: {
                        resourceId,
                        status: "CONFIRMED",

                        endAt: {
                            gt: new Date(),
                        },
                    },
                    select: {
                        id: true,
                    },
                });

            if (activeReservation) {
                throw new Error(
                    "Cannot deactivate a resource with ongoing or future confirmed reservations.",
                );
            }
        }

        // Step 6: Update resource status.
        //
        // No resource or reservation records are deleted.
        // Historical reservation records remain available.
        return tx.resource.update({
            where: {
                id: resourceId,
            },
            data: {
                isActive,
            },
        });
    });
}
