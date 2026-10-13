import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolClass } from "@/lib/structure/classes";
import type { Level } from "@/lib/structure/levels";

import { ClassRowActions } from "./class-row-actions";

type Props = { academicYearId: string; levels: Level[]; classes: SchoolClass[] };

/** One card per level that has classes, in level order; each class with its filière. */
export function ClassesList({ academicYearId, levels, classes }: Props) {
  const t = useTranslations("setup.classes");
  const takenNames = classes.map((c) => c.name);
  const groups = levels
    .map((level) => ({ level, classes: classes.filter((c) => c.levelId === level.id) }))
    .filter((g) => g.classes.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(({ level, classes: levelClasses }) => (
        <Card key={level.id} className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              {level.name}
              <span className="text-sm font-normal text-muted-foreground">
                {t("classCount", { count: levelClasses.length })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {levelClasses.map((c) => {
                const track = c.trackId ? level.tracks.find((tr) => tr.id === c.trackId) : undefined;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {track && (
                        <Badge variant="secondary" className="font-normal">
                          {track.name}
                        </Badge>
                      )}
                    </div>
                    <ClassRowActions
                      schoolClass={c}
                      academicYearId={academicYearId}
                      levels={levels}
                      takenNames={takenNames}
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
