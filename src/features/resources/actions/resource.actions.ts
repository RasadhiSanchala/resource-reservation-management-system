
"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
    createResource,
    updateResource,
    setResourceActiveStatus,
} from "../services/resource.service";

type ResourceActionResult =
    | { success: true; message: string }
    | { success: false; message: string };

// Detect PostgreSQL/Prisma unique constraint violations.
function isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }

    const code = "code" in error ? error.code : undefined;

    if (code === "P2002" || code === "23505") {
        return true;
    }

    // Some database drivers wrap the original error.
    if ("cause" in error) {
        return isUniqueConstraintError(error.cause);
    }

    return false;
}

// Convert internal errors into safe, meaningful UI messages.
function getErrorMessage(error: unknown): string {
    // Resource identity uniqueness violation.
    if (isUniqueConstraintError(error)) {
        return (
            "A resource with this name already exists " +
            "at this location."
        );
    }

    // Input validation errors.
    if (error instanceof ZodError) {
        return error.issues[0]?.message ?? "Invalid resource data.";
    }

    // Known business-rule violations.
    if (error instanceof Error) {
        if (error.message === "Resource not found") {
            return error.message;
        }

        if (
            error.message.startsWith("Cannot reduce capacity") ||
            error.message.startsWith("Cannot deactivate a resource")
        ) {
            return error.message;
        }
    }

    // Never expose internal database details to users.
    return "Unable to complete the operation. Please try again.";
}

// Create a resource.
export async function createResourceAction(
    input: unknown,
): Promise<ResourceActionResult> {
    try {
        await createResource(input);

        revalidatePath("/resources");

        return {
            success: true,
            message: "Resource created successfully.",
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
        };
    }
}

// Update resource details.
export async function updateResourceAction(
    id: string,
    input: unknown,
): Promise<ResourceActionResult> {
    try {
        await updateResource(id, input);

        revalidatePath("/resources");

        return {
            success: true,
            message: "Resource updated successfully.",
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
        };
    }
}

// Activate or deactivate a resource.
export async function setResourceStatusAction(
    id: string,
    isActive: boolean,
): Promise<ResourceActionResult> {
    try {
        await setResourceActiveStatus(id, { isActive });

        revalidatePath("/resources");

        return {
            success: true,
            message: isActive
                ? "Resource activated successfully."
                : "Resource deactivated successfully.",
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
        };
    }
}
