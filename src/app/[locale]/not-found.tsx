import { FileQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild>
        <Link href="/start">{t("backHome")}</Link>
      </Button>
    </main>
  );
}
