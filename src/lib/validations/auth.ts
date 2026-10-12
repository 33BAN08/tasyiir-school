import { z } from "zod";

// Error messages are next-intl keys under `auth.errors`.

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "invalidEmail" })),
  password: z.string().min(1, { error: "passwordRequired" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { error: "passwordTooShort" })
      // bcrypt (used by Supabase Auth) ignores bytes after 72.
      .max(72, { error: "passwordTooLong" })
      .regex(/\p{L}/u, { error: "passwordWeak" })
      .regex(/\p{N}/u, { error: "passwordWeak" }),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    error: "passwordMismatch",
    path: ["confirm"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
