"use client";

import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Level } from "@/lib/structure/levels";

const NO_TRACK = "none"; // a Select item cannot have the value ""

type Props = {
  levels: Level[];
  levelId: string;
  trackId: string;
  onLevelChange: (level: Level) => void;
  onTrackChange: (trackId: string) => void;
  levelError?: string;
  trackError?: string;
};

/** Level, then the filière of that level (optional, shown only when the level has some). */
export function LevelTrackFields({ levels, levelId, trackId, onLevelChange, onTrackChange, levelError, trackError }: Props) {
  const t = useTranslations("setup.classes.form");
  const level = levels.find((l) => l.id === levelId);

  return (
    <>
      <Field data-invalid={!!levelError}>
        <FieldLabel htmlFor="field-levelId">{t("level")}</FieldLabel>
        <Select
          value={levelId}
          onValueChange={(id) => {
            const next = levels.find((l) => l.id === id);
            if (next) onLevelChange(next);
          }}
        >
          <SelectTrigger id="field-levelId" className="w-full" aria-invalid={!!levelError}>
            <SelectValue placeholder={t("levelPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {levelError && <FieldError>{levelError}</FieldError>}
      </Field>

      {level && level.tracks.length > 0 && (
        <Field data-invalid={!!trackError}>
          <FieldLabel htmlFor="field-trackId">{t("track")}</FieldLabel>
          <Select value={trackId || NO_TRACK} onValueChange={(id) => onTrackChange(id === NO_TRACK ? "" : id)}>
            <SelectTrigger id="field-trackId" className="w-full" aria-invalid={!!trackError}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TRACK}>{t("noTrack")}</SelectItem>
              {level.tracks.map((track) => (
                <SelectItem key={track.id} value={track.id}>
                  {track.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("trackHint")}</FieldDescription>
          {trackError && <FieldError>{trackError}</FieldError>}
        </Field>
      )}
    </>
  );
}
