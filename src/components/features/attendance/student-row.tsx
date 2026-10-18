"use client";

import { Check, Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { StudentAvatar } from "@/components/features/students/student-avatar";
import { Input } from "@/components/ui/input";
import type { RollCallMark } from "@/lib/attendance/types";
import { cn } from "@/lib/utils";

export type RollCallStudentView = {
  id: string;
  name: string;
  otherName: string | null;
  initials: string;
  photoUrl: string | null;
};

type Props = {
  student: RollCallStudentView;
  mark: RollCallMark | undefined;
  onTap: () => void;
  onMinutes: (minutes: number | null) => void;
};

const STYLE = {
  present: { row: "bg-card", badge: "text-success", Icon: Check },
  absent: { row: "border-danger bg-danger/10", badge: "text-danger", Icon: X },
  late: { row: "border-warning bg-warning/10", badge: "text-warning", Icon: Clock },
} as const;

/** One student: a big row to tap (present → absent → late → present); a late student gets an optional minutes box. */
export function StudentRow({ student, mark, onTap, onMinutes }: Props) {
  const t = useTranslations("attendance.rollCall");
  const status = mark?.status ?? "present";
  const { row, badge, Icon } = STYLE[status];

  return (
    <li className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onTap}
        aria-label={t("rowLabel", { name: student.name, status: t(`status.${status}`) })}
        className={cn(
          "flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-start transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]",
          row,
        )}
      >
        <StudentAvatar url={student.photoUrl} initials={student.initials} alt="" className="size-12 shrink-0 text-sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="line-clamp-2 text-base font-medium break-words">{student.name}</bdi>
          {student.otherName && <bdi className="truncate text-sm text-muted-foreground">{student.otherName}</bdi>}
        </span>
        <span className={cn("flex shrink-0 items-center gap-1 text-sm font-medium", badge)}>
          <Icon className="size-5" aria-hidden />
          {t(`status.${status}`)}
        </span>
      </button>
      {status === "late" && (
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          dir="ltr"
          value={mark?.minutesLate ?? ""}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            const value = digits === "" ? null : Math.min(240, Math.max(1, Number(digits)));
            onMinutes(value);
          }}
          placeholder={t("minutesPlaceholder")}
          aria-label={t("minutesLabel", { name: student.name })}
          className="h-auto min-h-16 w-20 shrink-0 text-center text-base"
        />
      )}
    </li>
  );
}
