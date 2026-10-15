
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import { createReservation } from "../src/features/reservations/services/reservation.service";

import { cancelReservation } from "../src/features/reservations/services/reservation-cancellation.service";

import {
    listReservations,
    getReservationById,
} from "../src/features/reservations/services/reservation-query.service";

const testResourceIds = new Set<string>();

async function createTestResource() {
    const resource = await prisma.resource.create({
        data: {
            name: `Query Test Room ${randomUUID()}`,
            category: "ROOM",
            location: "Reservation Query Test Area",
            capacity: 10,
            isActive: true,
        },
    });

    testResourceIds.add(resource.id);
    return resource;
}

function interval(
    startHoursFromNow: number,
    durationHours = 1,
) {
    const startAt = new Date(
        Date.now() + startHoursFromNow * 3600000,
    );

    const endAt = new Date(
        startAt.getTime() + durationHours * 3600000,
    );

    return {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
    };
}

// Remove only the records created by these tests.
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

// TEST 1: List reservations with resource information.
test("List reservations for a selected resource", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee A",
        ...interval(48),
    });

    const results = await listReservations({
        resourceId: resource.id,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].id, booking.id);
    assert.equal(results[0].resource.name, resource.name);
    assert.equal(results[0].status, "CONFIRMED");
});

// TEST 2: Date-range filters use interval overlap.
test("Find bookings overlapping a selected time range", async () => {
    const resource = await createTestResource();

    const bookingInterval = interval(48, 3);

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee B",
        ...bookingInterval,
    });

    // Search for a smaller interval inside the booking.
    const from = new Date(
        new Date(bookingInterval.startAt).getTime() + 3600000,
    );

    const to = new Date(
        from.getTime() + 3600000,
    );

    const results = await listReservations({
        resourceId: resource.id,
        from: from.toISOString(),
        to: to.toISOString(),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].id, booking.id);

    // A range starting exactly when the booking ends
    // must not overlap the booking.
    const adjacentFrom = new Date(bookingInterval.endAt);

    const adjacentTo = new Date(
        adjacentFrom.getTime() + 3600000,
    );

    const adjacentResults = await listReservations({
        resourceId: resource.id,
        from: adjacentFrom.toISOString(),
        to: adjacentTo.toISOString(),
    });

    assert.equal(adjacentResults.length, 0);
});

// TEST 3: Filter cancelled reservation history.
test("Filter reservations by cancelled status", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee C",
        ...interval(72),
    });

    await cancelReservation(booking.id);

    const cancelledResults = await listReservations({
        resourceId: resource.id,
        status: "CANCELLED",
    });

    const confirmedResults = await listReservations({
        resourceId: resource.id,
        status: "CONFIRMED",
    });

    assert.equal(cancelledResults.length, 1);
    assert.equal(cancelledResults[0].id, booking.id);
    assert.equal(confirmedResults.length, 0);
});

// TEST 4: Get reservation details by ID.
test("Retrieve one reservation with resource details", async () => {
    const resource = await createTestResource();

    const booking = await createReservation({
        resourceId: resource.id,
        requesterName: "Employee D",
        team: "Engineering",
        purpose: "Planning Meeting",
        attendeeCount: 5,
        ...interval(96),
    });

    const result = await getReservationById(booking.id);

    assert.ok(result);
    assert.equal(result.id, booking.id);
    assert.equal(result.requesterName, "Employee D");
    assert.equal(result.team, "Engineering");
    assert.equal(result.resource.name, resource.name);

    const missing = await getReservationById(randomUUID());

    assert.equal(missing, null);
});
