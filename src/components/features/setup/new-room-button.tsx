"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { RoomDialog } from "./room-dialog";

export function NewRoomButton() {
  const t = useTranslations("setup.rooms");
  const [open, setOpen] = useState(false);

  return (
    <RoomDialog
      defaults={{ name: "", capacity: "30", roomType: "classroom" }}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      }
    />
  );
}
