
"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  createReservation,
  ReservationBusinessError,
} from "../services/reservation.service";

import { cancelReservation } from "../services/reservation-cancellation.service";

import { rescheduleReservation } from "../services/reservation-rescheduling.service";

import { checkResourceAvailability } from "../services/availability.service";

// Common response for create, cancel and reschedule actions.
type ReservationActionResult = {
  success: boolean;
  message: string;
};

// Availability response returned to the browser.
type AvailabilityActionResult =
  | {
      success: true;
      message: string;
      availability: {
        resourceId: string;
        resourceName: string;
        isAvailable: boolean;
        startAt: string;
        endAt: string;
        conflictingReservations: Array<{
          id: string;
          startAt: string;
          endAt: string;
        }>;
      };
    }
  | {
      success: false;
      message: string;
      availability?: never;
    };

/**
 * Convert validation and business errors into
 * safe, user-friendly messages.
 *
 * Internal database details are not exposed.
 */
function getReservationErrorMessage(error: unknown): string {
  // Zod input validation failures.
  if (error instanceof ZodError) {
    return (
      error.issues[0]?.message ??
      "Invalid reservation details."
    );
  }

  // Known business rule failures.
  if (error instanceof ReservationBusinessError) {
    return error.message;
  }

  // Unexpected errors should not expose
  // database connection strings or SQL details.
  return "Unable to complete the operation. Please try again.";
}

/**
 * CREATE RESERVATION ACTION
 *
 * Called by the frontend booking form.
 */
export async function createReservationAction(
  input: unknown,
): Promise<ReservationActionResult> {
  try {
    await createReservation(input);

    revalidatePath("/reservations");

    return {
      success: true,
      message: "Reservation created successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getReservationErrorMessage(error),
    };
  }
}

/**
 * CANCEL RESERVATION ACTION
 *
 * Cancels an eligible confirmed reservation
 * without removing the database record.
 */
export async function cancelReservationAction(
  id: string,
): Promise<ReservationActionResult> {
  try {
    await cancelReservation(id);

    revalidatePath("/reservations");

    return {
      success: true,
      message: "Reservation cancelled successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getReservationErrorMessage(error),
    };
  }
}

/**
 * RESCHEDULE RESERVATION ACTION
 *
 * Changes the reservation time or resource.
 * Existing business rules and conflict
 * protection remain enforced by the service.
 */
export async function rescheduleReservationAction(
  id: string,
  input: unknown,
): Promise<ReservationActionResult> {
  try {
    await rescheduleReservation(id, input);

    revalidatePath("/reservations");

    return {
      success: true,
      message: "Reservation rescheduled successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getReservationErrorMessage(error),
    };
  }
}

/**
 * CHECK AVAILABILITY ACTION
 *
 * Provides a read-only availability preview.
 *
 * This is not a reservation guarantee.
 * Booking creation performs its own checks.
 */
export async function checkAvailabilityAction(
  input: unknown,
): Promise<AvailabilityActionResult> {
  try {
    const result = await checkResourceAvailability(input);

    // Convert Date objects to ISO strings
    // for predictable browser-side processing.
    const availability = {
      resourceId: result.resourceId,
      resourceName: result.resourceName,
      isAvailable: result.isAvailable,
      startAt: result.startAt.toISOString(),
      endAt: result.endAt.toISOString(),

      conflictingReservations:
        result.conflictingReservations.map((booking) => ({
          id: booking.id,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
        })),
    };

    return {
      success: true,
      message: availability.isAvailable
        ? "Resource is available for the selected time."
        : "Resource is already reserved for the selected time.",
      availability,
    };
  } catch (error) {
    return {
      success: false,
      message: getReservationErrorMessage(error),
    };
  }
}
