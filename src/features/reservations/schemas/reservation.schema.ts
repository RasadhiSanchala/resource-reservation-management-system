
import { z } from "zod";

// Convert empty optional text fields into undefined.
const optionalText = (maxLength: number) =>
    z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z.string().trim().max(maxLength).optional(),
    );

// Optional number must be a positive whole number.
const optionalAttendeeCount = z.preprocess(
    (value) => {
        if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "")
        ) {
            return undefined;
        }

        return typeof value === "string"
            ? Number(value)
            : value;
    },
    z
        .number()
        .int("Attendee count must be a whole number")
        .positive("Attendee count must be greater than zero")
        .optional(),
);

// Require ISO datetime strings with timezone information.
// Examples:
// 2026-10-14T10:00:00+05:30
// 2026-10-14T04:30:00.000Z
const reservationDateTime = z.iso.datetime({
    offset: true,
});

// Validate reservation creation input.
export const createReservationSchema = z
    .strictObject({
        resourceId: z.uuid("Invalid resource ID"),

        requesterName: z
            .string()
            .trim()
            .min(1, "Requester name is required")
            .max(120, "Requester name is too long"),

        team: optionalText(120),

        purpose: optionalText(500),

        attendeeCount: optionalAttendeeCount,

        startAt: reservationDateTime,

        endAt: reservationDateTime,
    })
    .superRefine((data, context) => {
        const start = new Date(data.startAt).getTime();
        const end = new Date(data.endAt).getTime();

        // BR-001: End time must be after start time.
        if (end <= start) {
            context.addIssue({
                code: "custom",
                path: ["endAt"],
                message: "End time must be after start time.",
            });
        }

        // BR-002: New reservations must begin in the future.
        if (start <= Date.now()) {
            context.addIssue({
                code: "custom",
                path: ["startAt"],
                message: "Reservation start time must be in the future.",
            });
        }
    });

export type CreateReservationInput = z.infer<
    typeof createReservationSchema
>;

export const checkAvailabilitySchema = z
    .strictObject({
        resourceId: z.uuid("Invalid resource ID"),

        startAt: z.iso.datetime({
            offset: true,
        }),

        endAt: z.iso.datetime({
            offset: true,
        }),

        attendeeCount: z
            .number()
            .int("Attendee count must be a whole number")
            .positive("Attendee count must be greater than zero")
            .optional(),
    })
    .superRefine((data, context) => {
        const start = new Date(data.startAt).getTime();
        const end = new Date(data.endAt).getTime();

        if (end <= start) {
            context.addIssue({
                code: "custom",
                path: ["endAt"],
                message: "End time must be after start time.",
            });
        }

        if (start <= Date.now()) {
            context.addIssue({
                code: "custom",
                path: ["startAt"],
                message: "Availability can only be checked for a future start time.",
            });
        }
    });

export type CheckAvailabilityInput = z.infer<
    typeof checkAvailabilitySchema
>;


export const rescheduleReservationSchema = z
    .strictObject({
        // Optional: keep the current resource if not provided.
        resourceId: z.uuid("Invalid resource ID").optional(),

        // The complete new interval must be supplied.
        startAt: z.iso.datetime({
            offset: true,
        }),

        endAt: z.iso.datetime({
            offset: true,
        }),
    })
    .superRefine((data, context) => {
        const start = new Date(data.startAt).getTime();
        const end = new Date(data.endAt).getTime();

        if (end <= start) {
            context.addIssue({
                code: "custom",
                path: ["endAt"],
                message: "End time must be after start time.",
            });
        }

        if (start <= Date.now()) {
            context.addIssue({
                code: "custom",
                path: ["startAt"],
                message: "New reservation start time must be in the future.",
            });
        }
    });

export type RescheduleReservationInput = z.infer<
    typeof rescheduleReservationSchema
>;
