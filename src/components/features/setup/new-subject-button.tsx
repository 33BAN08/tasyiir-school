"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { SubjectDialog } from "./subject-dialog";

export function NewSubjectButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useTranslations("setup.subjects");
  const [open, setOpen] = useState(false);

  return (
    <SubjectDialog
      defaults={{ name: "", code: "", color: "teal" }}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={variant}>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      }
    />
  );
}
