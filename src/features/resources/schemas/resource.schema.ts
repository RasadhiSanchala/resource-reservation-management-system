import { z } from "zod";

const resourceFields = {
  name: z
    .string()
    .trim()
    .min(1, "Resource name is required")
    .max(120, "Resource name is too long"),

  category: z.enum(["ROOM", "EQUIPMENT", "OTHER"]),

  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(160, "Location is too long"),

  description: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(1000).optional(),
  ),

  capacity: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return typeof value === "string" ? Number(value) : value;
  }, z.number().int("Capacity must be a whole number").positive("Capacity must be greater than zero").optional()),
};

// Schema for creating a new resource
export const createResourceSchema = z.strictObject(resourceFields);

// Schema for editing resource details

export const updateResourceSchema = z
  .strictObject({
    ...resourceFields,

    description: z.preprocess(
      (value) =>
        value === null ||
          (typeof value === "string" && value.trim() === "")
          ? null
          : value,
      z.string().trim().max(1000).nullable().optional(),
    ),

    capacity: z.preprocess(
      (value) =>
        value === "" || value === null
          ? null
          : typeof value === "string"
            ? Number(value)
            : value,
      z
        .number()
        .int("Capacity must be a whole number")
        .positive("Capacity must be greater than zero")
        .nullable()
        .optional(),
    ),
  })
  .partial()
  .refine(
    (data) =>
      Object.values(data).some((value) => value !== undefined),
    "At least one field must be provided",
  );


// Schema for resource activation/deactivation
export const resourceStatusSchema = z.strictObject({
  isActive: z.boolean(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
