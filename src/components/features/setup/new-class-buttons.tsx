"use client";

import { CopyPlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Level } from "@/lib/structure/levels";

import { ClassBatchDialog } from "./class-batch-dialog";
import { ClassDialog } from "./class-dialog";

type Props = { academicYearId: string; levels: Level[]; takenNames: string[] };

/** "Create several classes" (the usual start of a year) and "New class". */
export function NewClassButtons({ academicYearId, levels, takenNames }: Props) {
  const t = useTranslations("setup.classes");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <ClassBatchDialog
        academicYearId={academicYearId}
        levels={levels}
        takenNames={takenNames}
        trigger={
          <Button variant="outline">
            <CopyPlus aria-hidden />
            {t("newMany")}
          </Button>
        }
      />
      <ClassDialog
        academicYearId={academicYearId}
        defaults={{ levelId: "", trackId: "", name: "" }}
        levels={levels}
        takenNames={takenNames}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button>
            <Plus aria-hidden />
            {t("new")}
          </Button>
        }
      />
    </div>
  );
}
