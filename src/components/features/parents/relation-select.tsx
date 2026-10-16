"use client";

import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RELATIONS, type Relation } from "@/lib/validations/parents";

type Props = {
  id: string;
  value: Relation | "";
  onChange: (relation: Relation) => void;
  invalid?: boolean;
  /** Relations the student already has (one father, one mother): shown disabled. */
  taken?: readonly Relation[];
};

/** Père / Mère / Tuteur. */
export function RelationSelect({ id, value, onChange, invalid, taken = [] }: Props) {
  const t = useTranslations("parents.children");
  const tRel = useTranslations("parents.relations");

  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v as Relation)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={t("relationPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {RELATIONS.map((r) => {
          const isTaken = r !== "tutor" && taken.includes(r);
          return (
            <SelectItem key={r} value={r} disabled={isTaken}>
              {isTaken ? t("relationTaken", { relation: tRel(r) }) : tRel(r)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
