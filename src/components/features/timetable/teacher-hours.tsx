import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { durationParts, slotMinutes } from "@/lib/timetable/hours";
import type { TimetableLesson, TimetableTeacher } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

type Props = {
  yearId: string;
  teachers: TimetableTeacher[];
  /** Every lesson of the year. */
  lessons: TimetableLesson[];
  slots: TimeSlot[];
  /** The teacher whose week is shown (highlighted). */
  currentId: string;
};

/** Weekly hours of every teacher of the school, with their number of classes; a name opens their week. */
export function TeacherHours({ yearId, teachers, lessons, slots, currentId }: Props) {
  const t = useTranslations("timetable");
  const minutesOf = new Map(slots.map((s) => [s.id, slotMinutes(s)]));
  const rows = teachers.map((teacher) => {
    const own = lessons.filter((l) => l.teacherId === teacher.id);
    return {
      teacher,
      minutes: own.reduce((sum, l) => sum + (minutesOf.get(l.slotId) ?? 0), 0),
      classes: new Set(own.map((l) => l.classId)).size,
    };
  });

  return (
    <section className="flex flex-col gap-2" aria-labelledby="teacher-hours-title">
      <h2 id="teacher-hours-title" className="text-lg font-semibold">
        {t("teacherHours.title")}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("teacherHours.teacher")}</TableHead>
            <TableHead>{t("teacherHours.classes")}</TableHead>
            <TableHead className="text-end">{t("teacherHours.hours")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ teacher, minutes, classes }) => (
            <TableRow key={teacher.id} className={cn(teacher.id === currentId && "bg-muted/50")} data-teacher-hours={teacher.id} data-minutes={minutes}>
              <TableCell>
                <Link
                  href={{ pathname: "/timetable", query: { year: yearId, view: "teacher", teacher: teacher.id } }}
                  aria-current={teacher.id === currentId ? "page" : undefined}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  <bdi>{teacher.name}</bdi>
                </Link>
                {!teacher.active && <span className="ms-2 text-xs text-muted-foreground">{t("dialog.inactive")}</span>}
              </TableCell>
              <TableCell className="font-numeric tabular-nums">{classes}</TableCell>
              <TableCell className="text-end font-numeric tabular-nums">{t("duration", durationParts(minutes))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
