"use client";

import { Check, Link2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { linkChild } from "@/lib/parents/guardian-actions";
import { formatMobile } from "@/lib/parents/phone";
import { searchGuardiansToLink, type GuardianMatch } from "@/lib/parents/student-guardian-actions";
import { cn } from "@/lib/utils";
import type { Relation } from "@/lib/validations/parents";

import { RelationSelect } from "./relation-select";
import { useParentsError } from "./use-parents-error";

const SEARCH_DELAY_MS = 300;

type Props = {
  studentId: string;
  /** Guardians already linked to this student. */
  linkedIds: string[];
  takenRelations: Relation[];
};

/** From a student's page: find an existing guardian (name or phone), pick the relation, link. */
export function LinkGuardianDialog({ studentId, linkedIds, takenRelations }: Props) {
  const t = useTranslations("students.guardians");
  const translateError = useParentsError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<GuardianMatch[] | null>(null);
  const [guardianId, setGuardianId] = useState("");
  const [relation, setRelation] = useState<Relation | "">("");
  const [error, setError] = useState<{ field: "guardian" | "relation"; key: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchGuardiansToLink(query);
      setMatches(result.ok ? result.data : []);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setMatches(null);
      setGuardianId("");
      setRelation("");
      setError(null);
    }
  }

  function submit() {
    if (!guardianId) return setError({ field: "guardian", key: "guardianRequired" });
    if (!relation) return setError({ field: "relation", key: "relationRequired" });
    startTransition(async () => {
      const result = await linkChild(guardianId, { studentId, relation });
      if (!result.ok) {
        if (result.field === "relation") setError({ field: "relation", key: result.error });
        else if (result.error === "alreadyLinked") setError({ field: "guardian", key: result.error });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("linked"));
      reset(false);
      router.refresh();
    });
  }

  const shown = query.trim().length >= 2 ? matches : null;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 aria-hidden />
          {t("link")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("linkTitle")}</DialogTitle>
          <DialogDescription>{t("linkDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <Field data-invalid={error?.field === "guardian"}>
            <FieldLabel htmlFor="guardian-search">{t("guardian")}</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="guardian-search"
                type="search"
                className="ps-8 [unicode-bidi:plaintext]"
                placeholder={t("searchPlaceholder")}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setGuardianId("");
                }}
              />
            </div>
            {shown && shown.length === 0 && <p className="text-sm text-muted-foreground">{t("noMatch")}</p>}
            {shown && shown.length > 0 && (
              <ul role="listbox" aria-label={t("guardian")} className="flex max-h-56 flex-col overflow-y-auto rounded-md border">
                {shown.map((g) => {
                  const linked = linkedIds.includes(g.id);
                  return (
                    <li key={g.id} role="option" aria-selected={guardianId === g.id} aria-disabled={linked}>
                      <button
                        type="button"
                        disabled={linked}
                        onClick={() => {
                          setGuardianId(g.id);
                          setError(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50",
                          guardianId === g.id && "bg-muted",
                        )}
                      >
                        <bdi className="min-w-0 flex-1 font-medium">{`${g.lastName} ${g.firstName}`}</bdi>
                        <bdi dir="ltr" className="font-numeric text-xs text-muted-foreground">
                          {formatMobile(g.phone)}
                        </bdi>
                        {linked ? (
                          <span className="text-xs text-muted-foreground">{t("alreadyLinked")}</span>
                        ) : (
                          guardianId === g.id && <Check className="size-4 text-primary" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error?.field === "guardian" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>
          <Field data-invalid={error?.field === "relation"}>
            <FieldLabel htmlFor="guardian-relation">{t("relation")}</FieldLabel>
            <RelationSelect
              id="guardian-relation"
              value={relation}
              onChange={(r) => {
                setRelation(r);
                setError(null);
              }}
              invalid={error?.field === "relation"}
              taken={takenRelations}
            />
            {error?.field === "relation" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? t("saving") : t("linkConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
