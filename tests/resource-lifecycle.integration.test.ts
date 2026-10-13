
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import {
    createResource,
    getResourceById,
    updateResource,
    setResourceActiveStatus,
} from "../src/features/resources/services/resource.service";

// Track only resources created by these tests.
const testResourceIds = new Set<string>();

// Create a unique resource for each test.
async function createTestResource(capacity = 20) {
    const suffix = randomUUID().slice(0, 8);

    const resource = await createResource({
        name: `Lifecycle Test Room ${suffix}`,
        category: "ROOM",
        location: `Test Floor ${suffix}`,
        capacity,
    });

    testResourceIds.add(resource.id);

    return resource;
}

// Create a future confirmed reservation.
async function createFutureReservation(
    resourceId: string,
    attendeeCount: number,
) {
    const startAt = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
    );

    const endAt = new Date(
        startAt.getTime() + 60 * 60 * 1000,
    );

    return prisma.reservation.create({
        data: {
            resourceId,
            requesterName: "Integration Test User",
            attendeeCount,
            startAt,
            endAt,
            status: "CONFIRMED",
        },
    });
}

// Remove test data after all tests.
// Reservations must be removed before resources.
after(async () => {
    try {
        const resourceIds = [...testResourceIds];

        if (resourceIds.length > 0) {
            await prisma.reservation.deleteMany({
                where: {
                    resourceId: {
                        in: resourceIds,
                    },
                },
            });

            await prisma.resource.deleteMany({
                where: {
                    id: {
                        in: resourceIds,
                    },
                },
            });
        }
    } finally {
        await prisma.$disconnect();
    }
});

// TEST 1
// Capacity reduction must not invalidate
// an existing confirmed reservation.
test("Reject capacity reduction with confirmed booking", async () => {
    const resource = await createTestResource(20);

    await createFutureReservation(resource.id, 15);

    await assert.rejects(
        () =>
            updateResource(resource.id, {
                capacity: 10,
            }),
        /Cannot reduce capacity/,
    );

    const unchanged = await getResourceById(resource.id);

    assert.equal(unchanged?.capacity, 20);

    console.log("CAPACITY REDUCTION PROTECTION: PASS");
});

// TEST 2
// Cancelled reservations must not block
// legitimate capacity reductions.
test("Allow capacity reduction after cancellation", async () => {
    const resource = await createTestResource(20);

    const reservation = await createFutureReservation(
        resource.id,
        15,
    );

    await prisma.reservation.update({
        where: {
            id: reservation.id,
        },
        data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
        },
    });

    const updated = await updateResource(resource.id, {
        capacity: 10,
    });

    assert.equal(updated.capacity, 10);

    // Confirm historical reservation still exists.
    const history = await prisma.reservation.findUnique({
        where: {
            id: reservation.id,
        },
    });

    assert.ok(history);
    assert.equal(history.status, "CANCELLED");

    console.log("CAPACITY AFTER CANCELLATION: PASS");
    console.log("RESERVATION HISTORY PRESERVED: PASS");
});

// TEST 3
// Deactivation must protect confirmed bookings,
// but cancellation must release the restriction.
test("Enforce resource deactivation and reactivation rules", async () => {
    const resource = await createTestResource(10);

    const reservation = await createFutureReservation(
        resource.id,
        5,
    );

    // Deactivation must fail while booking is confirmed.
    await assert.rejects(
        () =>
            setResourceActiveStatus(resource.id, {
                isActive: false,
            }),
        /Cannot deactivate a resource/,
    );

    const stillActive = await getResourceById(resource.id);

    assert.equal(stillActive?.isActive, true);

    console.log("FUTURE BOOKING DEACTIVATION BLOCKED: PASS");

    // Cancel the reservation.
    await prisma.reservation.update({
        where: {
            id: reservation.id,
        },
        data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
        },
    });

    // Deactivation should now succeed.
    const deactivated = await setResourceActiveStatus(
        resource.id,
        {
            isActive: false,
        },
    );

    assert.equal(deactivated.isActive, false);

    console.log("DEACTIVATION AFTER CANCELLATION: PASS");

    // Reactivation should succeed.
    const reactivated = await setResourceActiveStatus(
        resource.id,
        {
            isActive: true,
        },
    );

    assert.equal(reactivated.isActive, true);

    console.log("RESOURCE REACTIVATION: PASS");

    // Cancellation must remain in reservation history.
    const history = await prisma.reservation.findUnique({
        where: {
            id: reservation.id,
        },
    });

    assert.ok(history);
    assert.equal(history.status, "CANCELLED");

    console.log("LIFECYCLE HISTORY PRESERVATION: PASS");
});

test("Allow clearing optional resource fields", async () => {
    const resource = await createTestResource(10);

    // Set an initial description.
    await updateResource(resource.id, {
        description: "Conference room with projector",
    });

    // Clear both optional values.
    const updated = await updateResource(resource.id, {
        capacity: "",
        description: "",
    });

    assert.equal(updated.capacity, null);
    assert.equal(updated.description, null);

    // Verify that cleared values persist in PostgreSQL.
    const stored = await getResourceById(resource.id);

    assert.ok(stored);
    assert.equal(stored.capacity, null);
    assert.equal(stored.description, null);

    console.log("OPTIONAL FIELD CLEARING: PASS");
});
