import { MessageCircle, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMobile } from "@/lib/parents/phone";
import { getSchoolContact } from "@/lib/school-contact/contact";

/** Parent home: call or WhatsApp the school. Nothing when the director set no number. */
export async function SchoolContactCard({ schoolId }: { schoolId: string }) {
  const [contact, t] = await Promise.all([getSchoolContact(schoolId), getTranslations("portal.contact")]);
  if (!contact || (!contact.phone && !contact.whatsapp)) return null;
  const { phone, whatsapp } = contact;

  return (
    <Card className="gap-3 py-4" data-school-contact>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {phone && (
          <Button asChild variant="outline" className="min-h-11 justify-start">
            <a href={`tel:${phone}`} aria-label={t("callLabel", { phone: formatMobile(phone) })}>
              <Phone aria-hidden />
              {t("call")}
              <span dir="ltr" className="text-muted-foreground">
                {formatMobile(phone)}
              </span>
            </a>
          </Button>
        )}
        {whatsapp && (
          <Button asChild variant="outline" className="min-h-11 justify-start">
            <a
              href={`https://wa.me/${whatsapp.slice(1)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("whatsappLabel", { phone: formatMobile(whatsapp) })}
            >
              <MessageCircle aria-hidden />
              {t("whatsapp")}
              <span dir="ltr" className="text-muted-foreground">
                {formatMobile(whatsapp)}
              </span>
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
