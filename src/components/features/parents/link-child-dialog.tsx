"use client";

import { Check, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { linkChild, searchStudentsToLink, type StudentMatch } from "@/lib/parents/guardian-actions";
import { studentName, studentOtherName } from "@/lib/students/names";
import { cn } from "@/lib/utils";
import { RELATIONS, type Relation } from "@/lib/validations/parents";

import { useParentsError } from "./use-parents-error";

const SEARCH_DELAY_MS = 300;

/** Find a student of the school (name or Massar code), pick the relation, link. */
export function LinkChildDialog({ guardianId, linkedIds }: { guardianId: string; linkedIds: string[] }) {
  const t = useTranslations("parents.children");
  const tRel = useTranslations("parents.relations");
  const locale = useLocale();
  const translateError = useParentsError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StudentMatch[] | null>(null);
  const [studentId, setStudentId] = useState("");
  const [relation, setRelation] = useState<Relation | "">("");
  const [error, setError] = useState<{ field?: string; key: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchStudentsToLink(query);
      setMatches(result.ok ? result.data : []);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setMatches(null);
      setStudentId("");
      setRelation("");
      setError(null);
    }
  }

  function submit() {
    if (!studentId) return setError({ field: "studentId", key: "studentRequired" });
    if (!relation) return setError({ field: "relation", key: "relationRequired" });
    startTransition(async () => {
      const result = await linkChild(guardianId, { studentId, relation });
      if (!result.ok) {
        if (result.field) setError({ field: result.field, key: result.error });
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
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <Field data-invalid={error?.field === "studentId"}>
            <FieldLabel htmlFor="link-search">{t("student")}</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="link-search"
                type="search"
                className="ps-8"
                placeholder={t("searchPlaceholder")}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setStudentId("");
                }}
              />
            </div>
            {shown && shown.length === 0 && <p className="text-sm text-muted-foreground">{t("noMatch")}</p>}
            {shown && shown.length > 0 && (
              <ul role="listbox" aria-label={t("student")} className="flex max-h-56 flex-col overflow-y-auto rounded-md border">
                {shown.map((s) => {
                  const linked = linkedIds.includes(s.id);
                  const other = studentOtherName(s, locale);
                  return (
                    <li key={s.id} role="option" aria-selected={studentId === s.id} aria-disabled={linked}>
                      <button
                        type="button"
                        disabled={linked}
                        onClick={() => {
                          setStudentId(s.id);
                          setError(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50",
                          studentId === s.id && "bg-muted",
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col items-start">
                          <bdi className="font-medium">{studentName(s, locale)}</bdi>
                          {other && <bdi className="text-xs text-muted-foreground">{other}</bdi>}
                        </span>
                        {s.codeMassar && <bdi className="font-numeric text-xs text-muted-foreground">{s.codeMassar}</bdi>}
                        {linked ? (
                          <span className="text-xs text-muted-foreground">{t("alreadyLinked")}</span>
                        ) : (
                          studentId === s.id && <Check className="size-4 text-primary" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error?.field === "studentId" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>
          <Field data-invalid={error?.field === "relation"}>
            <FieldLabel htmlFor="link-relation">{t("relation")}</FieldLabel>
            <Select value={relation || undefined} onValueChange={(v) => setRelation(v as Relation)}>
              <SelectTrigger id="link-relation" className="w-full" aria-invalid={error?.field === "relation"}>
                <SelectValue placeholder={t("relationPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {tRel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {isPending ? t("linking") : t("link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
