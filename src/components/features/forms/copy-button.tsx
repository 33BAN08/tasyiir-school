"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard; the icon confirms for 2 s. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Button type="button" variant="outline" size={label ? "default" : "icon"} onClick={copy}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {label ?? <span className="sr-only">{t("copy")}</span>}
    </Button>
  );
}
