import { CalendarCheck, CalendarDays, GraduationCap, Megaphone, MessageSquareText, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { isolate, ltr } from "@/lib/format";
import type { ParentHome } from "@/lib/parents/home";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { cn } from "@/lib/utils";

type Props = {
  childId: string;
  hasClass: boolean;
  home: ParentHome;
  todayWeekday: number;
  /** Grades module on: the latest published card's name ("Semestre 1 · 2026-2027"), "" when none yet; null = no tile. */
  gradesLine: string | null;
};

/** Absences · announcements · remarks · timetable: each line is real data, each tile opens its page. */
export function HomeTiles({ childId, hasClass, home, todayWeekday, gradesLine }: Props) {
  const t = useTranslations("portal.home.tiles");
  const tTypes = useTranslations("remarks.types");
  const tDays = useTranslations("setup.timeSlots.days");
  const { lesson } = home;

  const lessonLine = !lesson
    ? null
    : lesson.now
      ? t("timetable.now", { subject: isolate(lesson.subjectName) })
      : lesson.day === todayWeekday
        ? t("timetable.today", { time: ltr(lesson.start) })
        : t("timetable.later", { day: tDays(DAY_KEYS[lesson.day as SchoolDay]), time: ltr(lesson.start) });

  return (
    <ul className="grid grid-cols-2 gap-3">
      <Tile
        icon={CalendarCheck}
        tone="danger"
        href={`/portal/absences?child=${childId}`}
        title={t("absences.title")}
        line={home.monthAbsences > 0 ? t("absences.month", { count: home.monthAbsences }) : t("absences.none")}
        name="absences"
      />
      <Tile
        icon={Megaphone}
        tone="brand"
        href="/portal/announcements"
        title={t("announcements.title")}
        line={
          home.announcements.unread > 0
            ? t("announcements.new", { count: home.announcements.unread })
            : home.announcements.latest
              ? t("announcements.upToDate")
              : t("announcements.none")
        }
        name="announcements"
      />
      {hasClass && (
        <Tile
          icon={MessageSquareText}
          tone="warning"
          href={`/portal/remarks?child=${childId}`}
          title={t("remarks.title")}
          line={
            home.remarks.unread > 0
              ? t("remarks.unread", { count: home.remarks.unread })
              : home.remarks.latestType
                ? t("remarks.latest", { type: tTypes(home.remarks.latestType) })
                : t("remarks.none")
          }
          name="remarks"
        />
      )}
      {hasClass && (
        <Tile
          icon={CalendarDays}
          tone="info"
          href={`/portal/timetable?child=${childId}`}
          title={t("timetable.title")}
          line={lessonLine}
          name="timetable"
        />
      )}
      {gradesLine !== null && (
        <Tile
          icon={GraduationCap}
          tone="brand"
          href={`/portal/grades?child=${childId}`}
          title={t("grades.title")}
          line={gradesLine ? t("grades.latest", { card: gradesLine }) : t("grades.none")}
          name="grades"
        />
      )}
    </ul>
  );
}

const TONES = {
  danger: "bg-danger/10 text-danger",
  brand: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
} as const;

function Tile({ icon: Icon, tone, href, title, line, name }: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  href: string;
  title: string;
  line: string | null;
  name: string;
}) {
  return (
    <li>
      <Link
        href={href}
        data-home-tile={name}
        className="flex h-full min-h-28 flex-col gap-2 rounded-2xl border bg-card p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("flex size-10 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="font-extrabold">{title}</span>
        {line && <span className="text-sm text-muted-foreground">{line}</span>}
      </Link>
    </li>
  );
}
