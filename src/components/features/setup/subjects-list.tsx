"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { deleteSubject } from "@/lib/structure/subject-actions";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import type { Subject } from "@/lib/structure/subjects";
import { cn } from "@/lib/utils";

import { EditDeleteMenu } from "./edit-delete-menu";
import { SubjectDialog } from "./subject-dialog";

/** Subjects in name order: colour, name, code, row menu. */
export function SubjectsList({ subjects }: { subjects: Subject[] }) {
  const t = useTranslations("setup.subjects");
  const tColors = useTranslations("setup.subjects.colors");

  return (
    <Card className="py-0">
      <ul className="divide-y">
        {subjects.map((subject) => (
          <li key={subject.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={cn("size-4 shrink-0 rounded-full", SUBJECT_SWATCH[subject.color])}
              role="img"
              aria-label={tColors(subject.color)}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{subject.name}</span>
            {subject.code && (
              <Badge variant="secondary" className="font-normal" dir="ltr">
                {subject.code}
              </Badge>
            )}
            <EditDeleteMenu
              label={t("actions", { name: subject.name })}
              editDialog={(props) => (
                <SubjectDialog
                  subjectId={subject.id}
                  defaults={{ name: subject.name, code: subject.code ?? "", color: subject.color }}
                  {...props}
                />
              )}
              deleteTitle={t("delete.title", { name: subject.name })}
              deleteDescription={t("delete.description")}
              onDelete={() => deleteSubject(subject.id)}
              deletedMessage={t("delete.done", { name: subject.name })}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
