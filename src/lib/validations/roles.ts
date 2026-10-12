import { z } from "zod";

// Role forms. Error messages are next-intl keys under `staffRoles.errors`
// (the `roles` namespace only holds the built-in role labels).

export const roleIdSchema = z.uuid();

export const roleNameSchema = z.object({
  name: z.string().trim().min(2, { error: "nameRequired" }).max(60, { error: "tooLong" }),
});
export type RoleNameFormValues = z.input<typeof roleNameSchema>;

export const rolePermissionsSchema = z.object({
  permissions: z
    .array(z.string().regex(/^[a-z_]+\.[a-z_]+$/, { error: "invalidPermission" }))
    .max(200, { error: "invalidPermission" })
    .transform((keys) => [...new Set(keys)]),
});
