import { z } from "zod";

import { normalizeMobile, phoneLoginEmail } from "@/lib/parents/phone";

// Error messages are next-intl keys under `auth.errors`.

/**
 * Staff sign in with their email, parents with their mobile number: a phone
 * becomes the parent account's Auth address (see lib/parents/phone.ts).
 */
export const loginSchema = z
  .object({
    login: z.string().trim().min(1, { error: "loginRequired" }),
    password: z.string().min(1, { error: "passwordRequired" }),
  })
  .transform((v, ctx) => {
    const phone = normalizeMobile(v.login);
    if (phone) return { email: phoneLoginEmail(phone), password: v.password };
    const email = z.email().safeParse(v.login.toLowerCase());
    if (email.success) return { email: email.data, password: v.password };
    ctx.addIssue({ code: "custom", path: ["login"], message: "invalidLogin" });
    return z.NEVER;
  });

export type LoginFormValues = z.input<typeof loginSchema>;
export type LoginInput = z.output<typeof loginSchema>;

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
