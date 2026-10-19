import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** "← Label" above a page title; the arrow turns with the reading direction. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ms-2 self-start">
      <Link href={href}>
        <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
