"use client";

import { useSyncExternalStore } from "react";

import { schoolClock, type SchoolClock } from "@/lib/timetable/now";

// The school's day and time, refreshed every 30 s. Null while the server
// renders (its clock is not the visitor's moment), so nothing is highlighted
// until the page runs in the browser — no hydration mismatch.

const subscribe = (onChange: () => void) => {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
};
// A string snapshot: unchanged within the same minute, so no extra renders.
const snapshot = () => {
  const clock = schoolClock(new Date());
  return `${clock.day} ${clock.time}`;
};

export function useSchoolClock(): SchoolClock | null {
  const value = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!value) return null;
  const [day, time] = value.split(" ");
  return { day: Number(day), time };
}
