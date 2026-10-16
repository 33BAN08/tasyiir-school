import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { SubjectChip } from "@/components/features/teachers/subject-chip";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { durationParts, slotMinutes } from "@/lib/timetable/hours";
import type { TimetableLesson } from "@/lib/timetable/types";

type Props = { lessons: TimetableLesson[]; slots: TimeSlot[] };

/** Weekly hours of a timetable: the total, then per subject (most hours first). */
export function WeeklyHours({ lessons, slots }: Props) {
  const t = useTranslations("timetable");
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const bySubject = new Map<string, { name: string; color: TimetableLesson["subjectColor"]; minutes: number }>();
  let total = 0;
  for (const lesson of lessons) {
    const slot = slotById.get(lesson.slotId);
    if (!slot) continue;
    const minutes = slotMinutes(slot);
    total += minutes;
    const entry = bySubject.get(lesson.subjectId) ?? { name: lesson.subjectName, color: lesson.subjectColor, minutes: 0 };
    entry.minutes += minutes;
    bySubject.set(lesson.subjectId, entry);
  }
  const subjects = [...bySubject.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 font-medium">
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        {t("weeklyHours", { duration: t("duration", durationParts(total)) })}
      </p>
      {subjects.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("bySubject")}>
          {subjects.map((s) => (
            <li key={s.name} className="flex items-center gap-1">
              <SubjectChip subject={s} />
              <span className="font-numeric text-sm tabular-nums text-muted-foreground">
                {t("duration", durationParts(s.minutes))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
