
import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import {
    createResource,
    getResourceById,
    listResources,
    updateResource,
    setResourceActiveStatus,
} from "../src/features/resources/services/resource.service";

async function main() {
    let testResourceId: string | undefined;
    let testReservationId: string | undefined;

    try {
        // 1. Create a temporary test resource.
        const created = await createResource({
            name: "Temporary Test Room",
            category: "ROOM",
            location: "Test Floor",
            capacity: 10,
        });

        testResourceId = created.id;

        if (!created.isActive) {
            throw new Error("New resource should be active");
        }

        console.log("CREATE RESOURCE: PASS");

        // 2. Retrieve the newly created resource.
        const retrieved = await getResourceById(created.id);

        if (!retrieved || retrieved.id !== created.id) {
            throw new Error("Resource retrieval failed");
        }

        console.log("GET RESOURCE: PASS");

        // 3. Check whether the resource appears in the list.
        const resources = await listResources();

        if (!resources.some((resource) => resource.id === created.id)) {
            throw new Error("Resource listing failed");
        }

        console.log("LIST RESOURCES: PASS");
        const updated = await updateResource(created.id, {
            name: "Updated Test Room",
            capacity: 6,
        });

        if (
            updated.name !== "Updated Test Room" ||
            updated.capacity !== 6
        ) {
            throw new Error("Resource update failed");
        }

        console.log("UPDATE RESOURCE: PASS");

        // Create a confirmed future reservation.
        const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

        const reservation = await prisma.reservation.create({
            data: {
                resourceId: created.id,
                requesterName: "Lifecycle Test User",
                attendeeCount: 4,
                startAt,
                endAt,
                status: "CONFIRMED",
            },
        });

        testReservationId = reservation.id;

        // Test 1: Deactivation must fail with a future booking.
        let deactivationBlocked = false;

        try {
            await setResourceActiveStatus(created.id, {
                isActive: false,
            });
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("Cannot deactivate a resource")
            ) {
                deactivationBlocked = true;
            } else {
                throw error;
            }
        }

        if (!deactivationBlocked) {
            throw new Error(
                "Deactivation should be blocked by confirmed reservations",
            );
        }

        console.log("DEACTIVATION PROTECTION: PASS");

        // Test 2: Cancel the reservation.
        await prisma.reservation.update({
            where: { id: reservation.id },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
            },
        });

        // Test 3: Deactivation should now succeed.
        const deactivated = await setResourceActiveStatus(created.id, {
            isActive: false,
        });

        if (deactivated.isActive !== false) {
            throw new Error("Resource deactivation failed");
        }

        console.log("DEACTIVATE RESOURCE: PASS");

        // Test 4: Reactivation should succeed.
        const reactivated = await setResourceActiveStatus(created.id, {
            isActive: true,
        });

        if (reactivated.isActive !== true) {
            throw new Error("Resource reactivation failed");
        }

        console.log("REACTIVATE RESOURCE: PASS");

    } finally {
        if (testReservationId) {
            await prisma.reservation.delete({
                where: { id: testReservationId },
            });
        }

        if (testResourceId) {
            await prisma.resource.delete({
                where: { id: testResourceId },
            });
        }

        await prisma.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error("RESOURCE SERVICE TEST FAILED:", error);
    process.exitCode = 1;
});
