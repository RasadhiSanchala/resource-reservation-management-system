
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
    const connection = await prisma.$queryRaw<
        Array<{ ok: number }>
    >`SELECT 1 AS ok`;

    const resourceCount = await prisma.resource.count();
    const reservationCount = await prisma.reservation.count();

    console.log("Database connection:", connection[0]?.ok === 1 ? "PASS" : "FAIL");
    console.log("Resources:", resourceCount);
    console.log("Reservations:", reservationCount);
}

main()
    .catch((error: unknown) => {
        console.error(
            "Database verification failed:",
            error instanceof Error ? error.message : "Unknown error",
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
