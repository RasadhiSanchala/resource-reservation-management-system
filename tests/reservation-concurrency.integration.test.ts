
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import {
    createReservation,
    ReservationBusinessError,
} from "../src/features/reservations/services/reservation.service";

import { setResourceActiveStatus } from "../src/features/resources/services/resource.service";

// Track only test-created resources.
const testResourceIds = new Set<string>();

async function createTestResource() {
    const resource = await prisma.resource.create({
        data: {
            name: `Concurrency Test Room ${randomUUID()}`,
            category: "ROOM",
            location: "Concurrency Test Area",
            capacity: 10,
            isActive: true,
        },
    });

    testResourceIds.add(resource.id);

    return resource;
}

function futureInterval() {
    const startAt = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
    );

    const endAt = new Date(
        startAt.getTime() + 60 * 60 * 1000,
    );

    return {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
    };
}

// Clean up test records only.
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

// TEST 1:
// Two simultaneous requests for the same interval.
// Exactly one must succeed.
test("Concurrent overlapping bookings allow only one success", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    const results = await Promise.allSettled([
        createReservation({
            resourceId: resource.id,
            requesterName: "Concurrent Employee A",
            attendeeCount: 5,
            ...interval,
        }),

        createReservation({
            resourceId: resource.id,
            requesterName: "Concurrent Employee B",
            attendeeCount: 5,
            ...interval,
        }),
    ]);

    const successful = results.filter(
        (result) => result.status === "fulfilled",
    );

    const rejected = results.filter(
        (result) => result.status === "rejected",
    );

    assert.equal(
        successful.length,
        1,
        "Exactly one concurrent booking must succeed.",
    );

    assert.equal(
        rejected.length,
        1,
        "Exactly one concurrent booking must be rejected.",
    );

    assert.ok(
        rejected[0].reason instanceof ReservationBusinessError &&
        rejected[0].reason.code === "TIME_CONFLICT",
        "Rejected booking must return a time conflict.",
    );

    const confirmedCount = await prisma.reservation.count({
        where: {
            resourceId: resource.id,
            status: "CONFIRMED",
        },
    });

    assert.equal(
        confirmedCount,
        1,
        "Only one confirmed booking may be stored.",
    );

    console.log("CONCURRENT DOUBLE BOOKING: PASS");
});

// TEST 2:
// Booking and resource deactivation at the same time.
// The final database state must remain valid.
test("Concurrent booking and deactivation preserve resource integrity", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    const results = await Promise.allSettled([
        createReservation({
            resourceId: resource.id,
            requesterName: "Lifecycle Concurrent Employee",
            attendeeCount: 5,
            ...interval,
        }),

        setResourceActiveStatus(resource.id, {
            isActive: false,
        }),
    ]);

    const successful = results.filter(
        (result) => result.status === "fulfilled",
    );

    const rejected = results.filter(
        (result) => result.status === "rejected",
    );

    // Either booking succeeds and deactivation fails,
    // or deactivation succeeds and booking fails.
    assert.equal(
        successful.length,
        1,
        "Exactly one competing operation must succeed.",
    );

    assert.equal(
        rejected.length,
        1,
        "Exactly one competing operation must be rejected.",
    );

    const error = rejected[0].reason;

    const expectedBusinessRejection =
        (error instanceof ReservationBusinessError &&
            error.code === "RESOURCE_INACTIVE") ||
        (error instanceof Error &&
            error.message.includes("Cannot deactivate a resource"));

    assert.ok(
        expectedBusinessRejection,
        "Rejected operation must have a valid business-rule reason.",
    );

    const storedResource = await prisma.resource.findUnique({
        where: {
            id: resource.id,
        },
    });

    assert.ok(storedResource);

    const confirmedCount = await prisma.reservation.count({
        where: {
            resourceId: resource.id,
            status: "CONFIRMED",
            endAt: {
                gt: new Date(),
            },
        },
    });

    // If room is inactive, there must be no
    // ongoing/future confirmed reservation.
    if (!storedResource.isActive) {
        assert.equal(
            confirmedCount,
            0,
            "Inactive resource must not contain a future confirmed booking.",
        );
    } else {
        assert.equal(
            confirmedCount,
            1,
            "Active resource should retain the successful booking.",
        );
    }

    console.log("BOOKING VS DEACTIVATION: PASS");
});
