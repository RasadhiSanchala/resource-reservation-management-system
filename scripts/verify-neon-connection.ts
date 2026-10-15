import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Safe read-only diagnostic. Never prints the connection string or password.
async function main() {
  const response = await prisma.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok
  `;
  if (response[0]?.ok !== 1) {
    throw new Error("Database returned an unexpected health-check result.");
  }

  const [resources, reservations] = await Promise.all([
    prisma.resource.count(),
    prisma.reservation.count(),
  ]);

  console.log("Neon connection via Prisma: PASS");
  console.log("Resource rows:", resources);
  console.log("Reservation rows:", reservations);
}

main()
  .catch((error: unknown) => {
    const e = error as { code?: unknown; cause?: unknown };
    console.error("Neon connection via Prisma: FAIL");
    if (typeof e?.code === "string") {
      console.error("Prisma error code:", e.code);
    }
    if (error instanceof Error) {
      // Don't print error.message: some drivers may include connection details.
      console.error("Error name:", error.name);
    }
    console.error("Check WebSocket/HTTPS access, the Neon endpoint and .env values.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
