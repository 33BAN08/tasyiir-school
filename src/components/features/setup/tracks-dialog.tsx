"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { Level, Track } from "@/lib/structure/levels";
import { createTrack, deleteTrack, renameTrack } from "@/lib/structure/track-actions";

import { useSetupError } from "./use-setup-error";

type Props = { level: Level; open: boolean; onOpenChange: (open: boolean) => void };

/** Filières of one level: rename in place, delete (second click confirms), add. */
export function TracksDialog({ level, open, onOpenChange }: Props) {
  const t = useTranslations("setup.levels.tracks");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTrack(level.id, { name: newName });
      if (!result.ok) {
        setAddError(translateError(result.error));
        return;
      }
      toast.success(t("added", { name: newName.trim() }));
      setNewName("");
      setAddError(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { level: level.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {level.tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {level.tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </ul>
        )}

        <form onSubmit={add} noValidate className="flex flex-col gap-1.5">
          <label htmlFor="new-track" className="text-sm font-medium">
            {t("addLabel")}
          </label>
          <div className="flex gap-2">
            <Input
              id="new-track"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(null);
              }}
              placeholder={t("addPlaceholder")}
              aria-invalid={!!addError}
              autoComplete="off"
            />
            <Button type="submit" disabled={isPending || newName.trim() === ""}>
              <Plus aria-hidden />
              {t("add")}
            </Button>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("close")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrackRow({ track }: { track: Track }) {
  const t = useTranslations("setup.levels.tracks");
  const translateError = useSetupError();
  const router = useRouter();
  const [name, setName] = useState(track.name);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const changed = name.trim() !== track.name && name.trim() !== "";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setConfirming(false);
      if (!result.ok) {
        toast.error(translateError(result.error ?? "generic"));
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("nameOf", { name: track.name })}
        disabled={isPending}
      />
      {changed && (
        <Button
          variant="outline"
          size="icon"
          aria-label={t("save")}
          disabled={isPending}
          onClick={() => run(() => renameTrack(track.id, { name }), t("renamed", { name: name.trim() }))}
        >
          <Check aria-hidden />
        </Button>
      )}
      {confirming ? (
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => run(() => deleteTrack(track.id), t("deleted", { name: track.name }))}
        >
          {t("confirmDelete")}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("delete", { name: track.name })}
          disabled={isPending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </li>
  );
}
