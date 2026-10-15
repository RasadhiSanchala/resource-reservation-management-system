
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

import { rescheduleReservation } from "../src/features/reservations/services/reservation-rescheduling.service";

const testResourceIds = new Set<string>();

async function createTestResource(
    capacity = 10,
    isActive = true,
) {
    const resource = await prisma.resource.create({
        data: {
            name: `Reschedule Test ${randomUUID()}`,
            category: "ROOM",
            location: "Rescheduling Test Area",
            capacity,
            isActive,
        },
    });

    testResourceIds.add(resource.id);
    return resource;
}

function futureInterval(hoursFromNow = 48) {
    const startAt = new Date(
        Date.now() + hoursFromNow * 60 * 60 * 1000,
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
                where: { resourceId: { in: ids } },
            });

            await prisma.resource.deleteMany({
                where: { id: { in: ids } },
            });
        }
    } finally {
        await prisma.$disconnect();
    }
});

// TEST 1: Reschedule the time, keeping the same ID.
test("Reschedule a confirmed booking successfully", async () => {
    const resource = await createTestResource();

    const original = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...futureInterval(48),
    });

    const newInterval = futureInterval(72);

    const updated = await rescheduleReservation(
        original.id,
        newInterval,
    );

    assert.equal(updated.id, original.id);
    assert.equal(updated.status, "CONFIRMED");
    assert.equal(
        updated.startAt.toISOString(),
        newInterval.startAt,
    );

    assert.equal(
        await prisma.reservation.count({
            where: { id: original.id },
        }),
        1,
    );
});

// TEST 2: Conflict must preserve original booking.
test("Reject conflicting reschedule without modifying original", async () => {
    const resource = await createTestResource();

    const occupiedInterval = futureInterval(48);
    const originalInterval = futureInterval(72);

    await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...occupiedInterval,
    });

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee B",
        ...originalInterval,
    });

    await assert.rejects(
        () =>
            rescheduleReservation(
                booking.id,
                occupiedInterval,
            ),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "TIME_CONFLICT",
    );

    const unchanged = await prisma.reservation.findUnique({
        where: { id: booking.id },
    });

    assert.ok(unchanged);
    assert.equal(
        unchanged.startAt.toISOString(),
        originalInterval.startAt,
    );
    assert.equal(
        unchanged.endAt.toISOString(),
        originalInterval.endAt,
    );
});

// TEST 3: Move booking to another resource.
test("Move reservation to another active resource", async () => {
    const source = await createTestResource();
    const target = await createTestResource();

    const interval = futureInterval();

    const booking = await createReservation({
        resourceId: source.id,
        requesterName: "Employee C",
        attendeeCount: 5,
        ...interval,
    });

    const moved = await rescheduleReservation(
        booking.id,
        {
            resourceId: target.id,
            ...interval,
        },
    );

    assert.equal(moved.id, booking.id);
    assert.equal(moved.resourceId, target.id);

    // The previous resource's interval is released.
    const replacement = await createReservation({
        resourceId: source.id,
        requesterName: "Employee D",
        ...interval,
    });

    assert.equal(replacement.status, "CONFIRMED");
});

// TEST 4: Protect inactive or insufficient resources.
test("Reject invalid target resources", async () => {
    const source = await createTestResource();
    const inactive = await createTestResource(10, false);
    const small = await createTestResource(3);

    const interval = futureInterval();

    const booking = await createReservation({
        resourceId: source.id,
        requesterName: "Employee E",
        attendeeCount: 5,
        ...interval,
    });

    for (const [resourceId, code] of [
        [inactive.id, "RESOURCE_INACTIVE"],
        [small.id, "CAPACITY_EXCEEDED"],
    ] as const) {
        await assert.rejects(
            () =>
                rescheduleReservation(booking.id, {
                    resourceId,
                    ...interval,
                }),
            (error: unknown) =>
                error instanceof ReservationBusinessError &&
                error.code === code,
        );
    }

    const unchanged = await prisma.reservation.findUnique({
        where: { id: booking.id },
    });

    assert.equal(unchanged?.resourceId, source.id);
});

// TEST 5: Protect cancelled and started reservations.
test("Reject rescheduling cancelled or started bookings", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee F",
        ...futureInterval(),
    });

    await cancelReservation(booking.id);

    await assert.rejects(
        () =>
            rescheduleReservation(
                booking.id,
                futureInterval(72),
            ),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESERVATION_NOT_CONFIRMED",
    );

    // Create an already-started booking for testing.
    const started = await prisma.reservation.create({
        data: {
            resourceId: resource.id,
            requesterName: "Ongoing Meeting",
            startAt: new Date(Date.now() - 3600000),
            endAt: new Date(Date.now() + 3600000),
            status: "CONFIRMED",
        },
    });

    await assert.rejects(
        () =>
            rescheduleReservation(
                started.id,
                futureInterval(96),
            ),
        (error: unknown) =>
            error instanceof ReservationBusinessError &&
            error.code === "RESERVATION_ALREADY_STARTED",
    );
});
