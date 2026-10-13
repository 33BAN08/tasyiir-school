import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CycleGroup } from "@/lib/structure/levels";

import { LevelRowActions } from "./level-row-actions";

/** One card per cycle; each level with its filières and its row menu. */
export function LevelsList({ groups }: { groups: CycleGroup[] }) {
  const t = useTranslations("setup.levels");
  const tCycles = useTranslations("setup.levels.cycles");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <Card key={group.cycle} className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              {tCycles(group.cycle)}
              <span className="text-sm font-normal text-muted-foreground">
                {t("levelCount", { count: group.levels.length })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {group.levels.map((level, i) => (
                <li key={level.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="font-medium">{level.name}</span>
                    {level.tracks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" aria-label={t("tracksOf", { name: level.name })}>
                        {level.tracks.map((track) => (
                          <Badge key={track.id} variant="secondary" className="font-normal">
                            {track.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <LevelRowActions level={level} isFirst={i === 0} isLast={i === group.levels.length - 1} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
