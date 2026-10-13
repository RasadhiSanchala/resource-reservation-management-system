
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../src/lib/prisma";

import {
  createResource,
  getResourceById,
  updateResource,
} from "../src/features/resources/services/resource.service";

// Track only resources created by these tests.
const testResourceIds = new Set<string>();

// Check for PostgreSQL/Prisma unique constraint errors.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as {
    code?: unknown;
    cause?: unknown;
  };

  if (
    databaseError.code === "P2002" ||
    databaseError.code === "23505"
  ) {
    return true;
  }

  if (databaseError.cause) {
    return isUniqueViolation(databaseError.cause);
  }

  return false;
}

// Clean up test data after all tests.
after(async () => {
  try {
    if (testResourceIds.size > 0) {
      await prisma.resource.deleteMany({
        where: {
          id: {
            in: [...testResourceIds],
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

// Test 1: Prevent duplicate resource creation.
test("Reject duplicate resource creation", async () => {
  const suffix = randomUUID().slice(0, 8);

  const name = `Integration Room ${suffix}`;
  const location = `Test Floor ${suffix}`;

  const original = await createResource({
    name,
    category: "ROOM",
    location,
    capacity: 10,
  });

  testResourceIds.add(original.id);

  await assert.rejects(
    async () => {
      const duplicate = await createResource({
        name: name.toUpperCase(),
        category: "ROOM",
        location: ` ${location.toUpperCase()} `,
        capacity: 10,
      });

      // Track the record if the database incorrectly allows it.
      testResourceIds.add(duplicate.id);
    },
    isUniqueViolation,
    "Database must reject duplicate resource creation",
  );

  const storedResource = await getResourceById(original.id);

  assert.ok(storedResource);
  assert.equal(storedResource.name, name);

  console.log("DUPLICATE CREATE: PASS");
});

// Test 2: Prevent updating another resource
// to an already-used name and location.
test("Reject duplicate resource update", async () => {
  const suffix = randomUUID().slice(0, 8);
  const location = `Test Floor ${suffix}`;

  const original = await createResource({
    name: `Meeting Room ${suffix}`,
    category: "ROOM",
    location,
    capacity: 10,
  });

  testResourceIds.add(original.id);

  const second = await createResource({
    name: `Training Room ${suffix}`,
    category: "ROOM",
    location,
    capacity: 20,
  });

  testResourceIds.add(second.id);

  await assert.rejects(
    () =>
      updateResource(second.id, {
        name: original.name.toUpperCase(),
        location: ` ${location.toUpperCase()} `,
      }),
    isUniqueViolation,
    "Database must reject duplicate resource updates",
  );

  // Verify the rejected update did not change the record.
  const unchanged = await getResourceById(second.id);

  assert.ok(unchanged);
  assert.equal(unchanged.name, second.name);
  assert.equal(unchanged.location, second.location);

  console.log("DUPLICATE UPDATE: PASS");
});
