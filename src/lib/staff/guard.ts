import "server-only";

import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";

export type StaffManager = SchoolActor;

/** Caller allowed to manage staff accounts (users.manage), or null. See getSchoolActor. */
export function getStaffManager(): Promise<StaffManager | null> {
  return getSchoolActor("users.manage");
}
