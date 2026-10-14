"use client";

import { Copy, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteTimeSlot } from "@/lib/structure/time-slot-actions";
import { DAY_KEYS, fromMinutes, toMinutes, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { cn } from "@/lib/utils";

import { CopyDayDialog } from "./copy-day-dialog";
import { EditDeleteMenu } from "./edit-delete-menu";
import { TimeSlotDialog } from "./time-slot-dialog";

type Props = {
  yearId: string;
  day: SchoolDay;
  /** This day's slots, in time order. */
  slots: TimeSlot[];
  filledDays: SchoolDay[];
};

/** "08:00 – 09:00", always left to right like a clock. */
export function TimeRange({ start, end }: { start: string; end: string }) {
  return (
    <span dir="ltr" className="font-numeric tabular-nums">
      {start} – {end}
    </span>
  );
}

/** One school day: its slots (lessons and breaks), add, copy to other days. */
export function TimeSlotDayCard({ yearId, day, slots, filledDays }: Props) {
  const t = useTranslations("setup.timeSlots");
  const tDays = useTranslations("setup.timeSlots.days");
  const tKinds = useTranslations("setup.timeSlots.kinds");
  const [dialog, setDialog] = useState<"add" | "copy" | null>(null);
  const dayName = tDays(DAY_KEYS[day]);
  const lessons = slots.filter((s) => s.kind === "lesson").length;

  // A new slot starts where the day ends, for one hour.
  const last = slots.at(-1);
  const start = last ? last.endTime : "08:00";
  const end = fromMinutes(Math.min(toMinutes(start) + 60, 23 * 60 + 59));

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{dayName}</CardTitle>
        <CardDescription>{t("lessonCount", { count: lessons })}</CardDescription>
        <CardAction className="flex gap-1">
          {slots.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("copyDay.button", { day: dayName })}
              title={t("copyDay.button", { day: dayName })}
              onClick={() => setDialog("copy")}
            >
              <Copy aria-hidden />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDialog("add")}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {slots.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("dayEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {slots.map((slot) => {
              // Unlabelled lessons show only their times; breaks always say what they are.
              const name = slot.label ?? (slot.kind === "break" ? tKinds("break") : "");
              return (
                <li
                  key={slot.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
                    slot.kind === "break" ? "bg-muted text-muted-foreground" : "border",
                  )}
                >
                  <TimeRange start={slot.startTime} end={slot.endTime} />
                  <span className={cn("min-w-0 flex-1 truncate", slot.kind === "lesson" && "font-medium")}>{name}</span>
                  <EditDeleteMenu
                    label={t("slotActions", { day: dayName, start: slot.startTime })}
                    editDialog={(props) => (
                      <TimeSlotDialog
                        yearId={yearId}
                        day={day}
                        slotId={slot.id}
                        defaults={{
                          startTime: slot.startTime,
                          endTime: slot.endTime,
                          kind: slot.kind,
                          label: slot.label ?? "",
                        }}
                        {...props}
                      />
                    )}
                    deleteTitle={t("delete.title", { day: dayName, start: slot.startTime, end: slot.endTime })}
                    deleteDescription={t("delete.description")}
                    onDelete={() => deleteTimeSlot(slot.id)}
                    deletedMessage={t("delete.done")}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <TimeSlotDialog
        yearId={yearId}
        day={day}
        defaults={{ startTime: start, endTime: end, kind: "lesson", label: "" }}
        open={dialog === "add"}
        onOpenChange={(open) => setDialog(open ? "add" : null)}
      />
      <CopyDayDialog
        yearId={yearId}
        day={day}
        filledDays={filledDays}
        open={dialog === "copy"}
        onOpenChange={(open) => setDialog(open ? "copy" : null)}
      />
    </Card>
  );
}
