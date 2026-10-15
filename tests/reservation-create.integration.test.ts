
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import {
    createReservation,
    ReservationBusinessError,
} from "../src/features/reservations/services/reservation.service";

const testResourceIds = new Set<string>();

async function createTestResource(
    capacity = 10,
    isActive = true,
) {
    const suffix = randomUUID();

    const resource = await prisma.resource.create({
        data: {
            name: `Reservation Test Room ${suffix}`,
            category: "ROOM",
            location: "Integration Test Area",
            capacity,
            isActive,
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

after(async () => {
    try {
        const ids = [...testResourceIds];

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

test("Create a valid confirmed reservation", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    const reservation = await createReservation({
        resourceId: resource.id,
        requesterName: "Test Employee",
        attendeeCount: 5,
        ...interval,
    });

    assert.equal(reservation.status, "CONFIRMED");
    assert.equal(reservation.resourceId, resource.id);

    const stored = await prisma.reservation.findUnique({
        where: { id: reservation.id },
    });

    assert.ok(stored);
    assert.equal(stored.requesterName, "Test Employee");
});

test("Reject overlapping booking and allow adjacent booking", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval,
    });

    await assert.rejects(
        () =>
            createReservation({
                resourceId: resource.id,
                requesterName: "Employee B",
                ...interval,
            }),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "TIME_CONFLICT",
    );

    const adjacentStart = new Date(interval.endAt);
    const adjacentEnd = new Date(
        adjacentStart.getTime() + 60 * 60 * 1000,
    );

    const adjacent = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee C",
        startAt: adjacentStart.toISOString(),
        endAt: adjacentEnd.toISOString(),
    });

    assert.equal(adjacent.status, "CONFIRMED");

    const count = await prisma.reservation.count({
        where: {
            resourceId: resource.id,
            status: "CONFIRMED",
        },
    });

    assert.equal(count, 2);
});

test("Reject booking an inactive resource", async () => {
    const resource = await createTestResource(10, false);

    await assert.rejects(
        () =>
            createReservation({
                resourceId: resource.id,
                requesterName: "Test Employee",
                ...futureInterval(),
            }),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESOURCE_INACTIVE",
    );
});

test("Reject reservation exceeding capacity", async () => {
    const resource = await createTestResource(5);

    await assert.rejects(
        () =>
            createReservation({
                resourceId: resource.id,
                requesterName: "Test Employee",
                attendeeCount: 10,
                ...futureInterval(),
            }),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "CAPACITY_EXCEEDED",
    );
});
