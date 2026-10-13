"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { LevelDialog } from "./level-dialog";

export function NewLevelButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useTranslations("setup.levels");
  const [open, setOpen] = useState(false);

  return (
    <LevelDialog
      defaults={{ name: "", cycle: "primaire" }}
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
