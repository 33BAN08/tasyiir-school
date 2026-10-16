"use client";

import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { MAX_IMPORT_BYTES, TEMPLATE_HEADERS, type ImportColumn } from "@/lib/students/import/columns";
import { commitImport, previewImport } from "@/lib/students/import/import-actions";
import type { ImportFileError, ImportPreview } from "@/lib/students/import/types";

import { ImportColumnsHelp } from "./import-columns-help";
import { ImportPreviewCard } from "./import-preview-card";
import { ImportTemplateButton } from "./import-template-button";

/**
 * Choose a file → preview (nothing saved; possible duplicates can be unticked)
 * → import every ticked row at once, or nothing.
 */
export function ImportWizard({ exampleClass }: { exampleClass: string | null }) {
  const t = useTranslations("students.import");
  const locale = useLocale() as keyof typeof TEMPLATE_HEADERS;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<ImportFileError | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number; excluded: number } | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  const errorText = (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  const fileErrorText = (e: ImportFileError) =>
    t(`fileErrors.${e.key}`, {
      columns: list((e.columns ?? []).map((c: ImportColumn) => (TEMPLATE_HEADERS[locale] ?? TEMPLATE_HEADERS.fr)[c])),
      max: Math.round(MAX_IMPORT_BYTES / 1024 / 1024),
    });

  function reset() {
    setFile(null);
    setPreview(null);
    setFileError(null);
    setDone(null);
    setExcluded(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  const formWithFile = (exclude?: Set<number>) => {
    const data = new FormData();
    if (file) data.set("file", file);
    if (exclude && exclude.size > 0) data.set("exclude", JSON.stringify([...exclude]));
    return data;
  };

  function check() {
    if (!file) return;
    startTransition(async () => {
      setFileError(null);
      const result = await previewImport(formWithFile());
      if (!result.ok) {
        if (result.file) setFileError(result.file);
        else toast.error(errorText(result.error));
        return;
      }
      setPreview(result.data);
      setExcluded(new Set());
    });
  }

  function runImport() {
    startTransition(async () => {
      const result = await commitImport(formWithFile(excluded));
      if (!result.ok) {
        if (result.file) setFileError(result.file);
        else toast.error(errorText(result.error));
        return;
      }
      setDone(result.data);
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-success" aria-hidden />
          <h2 className="text-lg font-semibold">{t("done.title")}</h2>
          <p className="text-muted-foreground">{t("done.text", { created: done.created, skipped: done.skipped, excluded: done.excluded })}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/students">{t("done.viewStudents")}</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              {t("done.another")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("file.title")}</CardTitle>
          <CardDescription>{t("file.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setFileError(null);
              }}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={isPending}>
              <FileSpreadsheet aria-hidden />
              {t("file.choose")}
            </Button>
            <bdi className="min-w-0 truncate text-sm">{file ? file.name : t("file.none")}</bdi>
          </div>
          <p className="text-sm text-muted-foreground">{t("file.hint", { max: Math.round(MAX_IMPORT_BYTES / 1024 / 1024) })}</p>
          {fileError && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {fileErrorText(fileError)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={check} disabled={!file || isPending}>
              <Upload aria-hidden />
              {isPending && !preview ? t("file.checking") : t("file.check")}
            </Button>
            <ImportTemplateButton exampleClass={exampleClass} />
          </div>
          <ImportColumnsHelp />
        </CardContent>
      </Card>

      {preview && (
        <ImportPreviewCard
          // A new file = a new preview: filters and pages start again.
          key={`${preview.fileName}-${preview.rows.length}-${preview.counts.error}`}
          preview={preview}
          excluded={excluded}
          onExcludedChange={setExcluded}
          pending={isPending}
          onReset={reset}
          onImport={runImport}
        />
      )}
    </div>
  );
}
