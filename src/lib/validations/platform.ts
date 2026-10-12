import { z } from "zod";

export const SCHOOL_STATUSES = ["active", "suspended"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "suspended", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SCHOOLS_PAGE_SIZE = 20;

/** First value of a query param (`?a=1&a=2` → "1"). */
const firstParam = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional());

/** URL query of the schools list. Invalid values fall back to defaults, never error. */
export const schoolListParamsSchema = z.object({
  q: firstParam.transform((v) => v?.trim().slice(0, 100) ?? ""),
  status: firstParam.transform((v) =>
    SCHOOL_STATUSES.includes(v as SchoolStatus) ? (v as SchoolStatus) : undefined,
  ),
  page: firstParam.transform((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
  }),
});

export type SchoolListParams = z.infer<typeof schoolListParamsSchema>;
