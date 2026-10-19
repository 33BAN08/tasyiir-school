"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { PostingOptions } from "@/lib/announcements/queries";
import { isolate } from "@/lib/format";

type Props = {
  kind: "levels" | "classes";
  options: PostingOptions;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
};

/** Tick the levels, or the classes (grouped by level), the announcement goes to. */
export function TargetPicker({ kind, options, value, onChange, error }: Props) {
  const t = useTranslations("announcements.form");
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id));

  const groups =
    kind === "levels"
      ? [{ title: null as string | null, items: options.levels.map((l) => ({ id: l.id, name: l.name })) }]
      : [...Map.groupBy(options.classes, (c) => c.levelId)].map(([, list]) => ({
          title: list[0].levelName,
          items: list.map((c) => ({ id: c.id, name: c.name })),
        }));

  return (
    <FieldSet data-invalid={!!error}>
      <FieldLegend variant="label">{t(kind === "levels" ? "levelsLabel" : "classesLabel")}</FieldLegend>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.title ?? kind} className="flex flex-col gap-2">
            {group.title && <p className="text-xs font-medium text-muted-foreground">{isolate(group.title)}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {group.items.map((item) => {
                const id = `${kind}-${item.id}`;
                return (
                  <Field key={item.id} orientation="horizontal" className="min-h-11 items-center rounded-lg border px-3">
                    <Checkbox id={id} checked={value.includes(item.id)} onCheckedChange={(on) => toggle(item.id, on === true)} />
                    <FieldLabel htmlFor={id} className="flex-1 py-2 font-normal">
                      <bdi>{item.name}</bdi>
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}
