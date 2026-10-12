import { z } from "zod";

import { enumParam, pageParam, searchParam, uuidParam } from "@/lib/validations/list-params";

/** active = signed in with own password; pending = still on the temporary one. */
export const STAFF_STATUSES = ["active", "pending", "deactivated"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

/** Family accounts are managed with students (Phase 5), not on the staff page. */
export const NON_STAFF_ROLE_KEYS = ["parent", "student"] as const;

export const STAFF_PAGE_SIZE = 20;

/** URL query of the staff list. Invalid values fall back to defaults, never error. */
export const staffListParamsSchema = z.object({
  q: searchParam,
  role: uuidParam,
  status: enumParam(STAFF_STATUSES),
  page: pageParam,
});

export type StaffListParams = z.infer<typeof staffListParamsSchema>;
