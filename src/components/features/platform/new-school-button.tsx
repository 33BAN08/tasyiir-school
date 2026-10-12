import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function NewSchoolButton() {
  const t = useTranslations("platform.schools");
  return (
    <Button asChild>
      <Link href="/platform/schools/new">
        <Plus aria-hidden />
        {t("newSchool")}
      </Link>
    </Button>
  );
}
