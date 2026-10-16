import { Badge } from "@/components/ui/badge";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import type { Subject } from "@/lib/structure/subjects";
import { cn } from "@/lib/utils";

/** A subject as a small chip: its colour dot + its name (the colour is never the only cue). */
export function SubjectChip({ subject }: { subject: Pick<Subject, "name" | "color"> }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[subject.color])} aria-hidden />
      <bdi>{subject.name}</bdi>
    </Badge>
  );
}
