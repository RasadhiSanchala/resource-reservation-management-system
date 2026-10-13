-- CreateEnum
CREATE TYPE "ResourceCategory" AS ENUM ('ROOM', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ResourceCategory" NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "requesterName" TEXT NOT NULL,
    "team" TEXT,
    "purpose" TEXT,
    "attendeeCount" INTEGER,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(6),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_isActive_category_idx" ON "Resource"("isActive", "category");

-- CreateIndex
CREATE INDEX "Reservation_resourceId_status_startAt_endAt_idx" ON "Reservation"("resourceId", "status", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Enable GiST equality support for UUID resource IDs
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Resource capacity must be positive when provided
ALTER TABLE "Resource"
ADD CONSTRAINT "resource_capacity_positive"
CHECK ("capacity" IS NULL OR "capacity" > 0);

-- Reservation end must be after start
ALTER TABLE "Reservation"
ADD CONSTRAINT "reservation_valid_time_range"
CHECK ("endAt" > "startAt");

-- Attendee count must be positive when provided
ALTER TABLE "Reservation"
ADD CONSTRAINT "reservation_attendee_count_positive"
CHECK ("attendeeCount" IS NULL OR "attendeeCount" > 0);

-- Prevent overlapping confirmed bookings for the same resource
ALTER TABLE "Reservation"
ADD CONSTRAINT "reservation_no_overlapping_confirmed"
EXCLUDE USING gist (
  "resourceId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
)
WHERE ("status" = 'CONFIRMED');
