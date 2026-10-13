
-- Prevent duplicate resource identities within the same location.
-- Name and location comparisons are case-insensitive
-- and ignore leading/trailing whitespace.

CREATE UNIQUE INDEX "resource_unique_normalized_name_location"
ON "Resource" (
    LOWER(BTRIM("name")),
    LOWER(BTRIM("location"))
);
