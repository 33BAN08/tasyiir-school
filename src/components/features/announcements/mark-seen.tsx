"use client";

import { useEffect } from "react";

import { markAnnouncementSeen } from "@/lib/announcements/actions";

/** Opening an announcement reads its notification (the bell follows through Realtime). */
export function MarkSeen({ id }: { id: string }) {
  useEffect(() => {
    void markAnnouncementSeen(id);
  }, [id]);
  return null;
}
