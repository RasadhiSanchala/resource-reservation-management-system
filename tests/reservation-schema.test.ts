
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

import { createReservationSchema } from "../src/features/reservations/schemas/reservation.schema";

function validReservation() {
    const startAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
    );

    const endAt = new Date(
        startAt.getTime() + 60 * 60 * 1000,
    );

    return {
        resourceId: randomUUID(),
        requesterName: "Test Employee",
        team: "Engineering",
        purpose: "Team Meeting",
        attendeeCount: 5,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
    };
}

test("Accept valid reservation details", () => {
    const result = createReservationSchema.safeParse(
        validReservation(),
    );

    assert.equal(result.success, true);
});

test("Reject blank requester name", () => {
    const result = createReservationSchema.safeParse({
        ...validReservation(),
        requesterName: "   ",
    });

    assert.equal(result.success, false);
});

test("Reject invalid time interval", () => {
    const reservation = validReservation();

    const result = createReservationSchema.safeParse({
        ...reservation,
        endAt: reservation.startAt,
    });

    assert.equal(result.success, false);
});

test("Reject past reservation start time", () => {
    const result = createReservationSchema.safeParse({
        ...validReservation(),
        startAt: new Date(
            Date.now() - 60 * 60 * 1000,
        ).toISOString(),
    });

    assert.equal(result.success, false);
});

test("Reject invalid attendee count", () => {
    const result = createReservationSchema.safeParse({
        ...validReservation(),
        attendeeCount: -5,
    });

    assert.equal(result.success, false);
});

test("Reject client-provided reservation status", () => {
    const result = createReservationSchema.safeParse({
        ...validReservation(),
        status: "CONFIRMED",
    });

    assert.equal(result.success, false);
});
