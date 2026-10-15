
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import {
    createReservation,
    ReservationBusinessError,
} from "../src/features/reservations/services/reservation.service";

import { cancelReservation } from "../src/features/reservations/services/reservation-cancellation.service";

const testResourceIds = new Set<string>();

async function createTestResource() {
    const resource = await prisma.resource.create({
        data: {
            name: `Cancellation Test Room ${randomUUID()}`,
            category: "ROOM",
            location: "Cancellation Test Area",
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

// Remove only test-created records.
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

// TEST 1
test("Cancel a future confirmed reservation", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...futureInterval(),
    });

    const cancelled = await cancelReservation(booking.id);

    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelledAt);

    const stored = await prisma.reservation.findUnique({
        where: {
            id: booking.id,
        },
    });

    assert.ok(stored);
    assert.equal(stored.status, "CANCELLED");
    assert.equal(stored.requesterName, "Employee A");

    console.log("FUTURE CANCELLATION: PASS");
    console.log("RESERVATION HISTORY PRESERVED: PASS");
});

// TEST 2
test("Cancelled time slot becomes available again", async () => {
    const resource = await createTestResource();
    const interval = futureInterval();

    const first = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval,
    });

    await cancelReservation(first.id);

    // Booking the same slot must now succeed.
    const second = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee B",
        ...interval,
    });

    assert.equal(second.status, "CONFIRMED");

    const history = await prisma.reservation.findMany({
        where: {
            resourceId: resource.id,
        },
    });

    assert.equal(history.length, 2);
    assert.equal(
        history.filter((r) => r.status === "CANCELLED").length,
        1,
    );
    assert.equal(
        history.filter((r) => r.status === "CONFIRMED").length,
        1,
    );

    console.log("CANCELLED SLOT REBOOKING: PASS");
});

// TEST 3
test("Reject repeated cancellation", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee C",
        ...futureInterval(),
    });

    await cancelReservation(booking.id);

    await assert.rejects(
        () => cancelReservation(booking.id),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESERVATION_NOT_CONFIRMED",
    );

    console.log("REPEATED CANCELLATION REJECTED: PASS");
});

// TEST 4
test("Reject cancellation after reservation has started", async () => {
    const resource = await createTestResource();

    // Direct test setup: create an ongoing booking.
    const startAt = new Date(
        Date.now() - 60 * 60 * 1000,
    );
    const endAt = new Date(
        Date.now() + 60 * 60 * 1000,
    );

    const booking = await prisma.reservation.create({
        data: {
            resourceId: resource.id,
            requesterName: "Ongoing Meeting",
            startAt,
            endAt,
            status: "CONFIRMED",
        },
    });

    await assert.rejects(
        () => cancelReservation(booking.id),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESERVATION_ALREADY_STARTED",
    );

    const unchanged = await prisma.reservation.findUnique({
        where: { id: booking.id },
    });

    assert.equal(unchanged?.status, "CONFIRMED");

    console.log("STARTED RESERVATION PROTECTED: PASS");
});

// TEST 5
test("Reject cancellation of a nonexistent reservation", async () => {
    await assert.rejects(
        () => cancelReservation(randomUUID()),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESERVATION_NOT_FOUND",
    );

    console.log("MISSING RESERVATION REJECTED: PASS");
});
