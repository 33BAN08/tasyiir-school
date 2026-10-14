"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { createRoom, updateRoom } from "@/lib/structure/room-actions";
import { ROOM_TYPES } from "@/lib/structure/room-types";
import { roomSchema, type RoomFormValues } from "@/lib/validations/structure";

import { useSetupError } from "./use-setup-error";

const NO_TYPE = "none"; // a Select item cannot have the value ""

type Props = {
  /** Edit this room; create a new one when absent. */
  roomId?: string;
  defaults: RoomFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit a room: name, capacity, optional type. */
export function RoomDialog({ roomId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.rooms.form");
  const tTypes = useTranslations("setup.rooms.types");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoomFormValues>({ resolver: zodResolver(roomSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = roomId ? await updateRoom(roomId, values) : await createRoom(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(roomId ? "updated" : "created", { name: values.name.trim() }));
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset(defaults);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(roomId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormTextField
            form={form}
            name="name"
            label={t("name")}
            description={t("nameHint")}
            autoComplete="off"
            translateError={translateError}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <FormTextField
              form={form}
              name="capacity"
              label={t("capacity")}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              translateError={translateError}
            />
            <Controller
              control={form.control}
              name="roomType"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="field-roomType">
                    {t("type")}
                    <span className="font-normal text-muted-foreground">({t("optional")})</span>
                  </FieldLabel>
                  <Select value={field.value || NO_TYPE} onValueChange={(v) => field.onChange(v === NO_TYPE ? "" : v)}>
                    <SelectTrigger id="field-roomType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TYPE}>{t("noType")}</SelectItem>
                      {ROOM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {tTypes(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
