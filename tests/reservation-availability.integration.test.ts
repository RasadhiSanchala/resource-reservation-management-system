
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import { createReservation } from "../src/features/reservations/services/reservation.service";

import { checkResourceAvailability } from "../src/features/reservations/services/availability.service";

const resourceIds = new Set<string>();

async function createTestResource(isActive = true) {
    const resource = await prisma.resource.create({
        data: {
            name: `Availability Test ${randomUUID()}`,
            category: "ROOM",
            location: "Test Area",
            capacity: 10,
            isActive,
        },
    });

    resourceIds.add(resource.id);

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

after(async () => {
    try {
        const ids = [...resourceIds];

        if (ids.length > 0) {
            await prisma.reservation.deleteMany({
                where: {
                    resourceId: { in: ids },
                },
            });

            await prisma.resource.deleteMany({
                where: {
                    id: { in: ids },
                },
            });
        }
    } finally {
        await prisma.$disconnect();
    }
});

test("Available resource returns true", async () => {
    const resource = await createTestResource();

    const result = await checkResourceAvailability({
        resourceId: resource.id,
        ...futureInterval(),
    });

    assert.equal(result.isAvailable, true);
    assert.equal(result.conflictingReservations.length, 0);
});

test("Overlapping confirmed booking returns unavailable", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval,
    });

    const result = await checkResourceAvailability({
        resourceId: resource.id,
        ...interval,
    });

    assert.equal(result.isAvailable, false);
    assert.equal(result.conflictingReservations.length, 1);
});

test("Adjacent reservation remains available", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval,
    });

    const nextStart = new Date(interval.endAt);
    const nextEnd = new Date(
        nextStart.getTime() + 60 * 60 * 1000,
    );

    const result = await checkResourceAvailability({
        resourceId: resource.id,
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
    });

    assert.equal(result.isAvailable, true);
});

test("Cancelled booking does not block availability", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval,
    });

    await prisma.reservation.update({
        where: { id: booking.id },
        data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
        },
    });

    const result = await checkResourceAvailability({
        resourceId: resource.id,
        ...interval,
    });

    assert.equal(result.isAvailable, true);
});

test("Inactive resource is rejected", async () => {
    const resource = await createTestResource(false);

    await assert.rejects(
        () =>
            checkResourceAvailability({
                resourceId: resource.id,
                ...futureInterval(),
            }),
        /inactive/,
    );
});
