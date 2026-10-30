"use client";

import { MoreHorizontal, Pencil, Plus, Power, Trash2, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { amountInputText, formatCentimes } from "@/lib/fees/money";
import { deleteFeeService, updateFeeService } from "@/lib/fees/settings-actions";
import { serviceName } from "@/lib/fees/names";
import type { FeeService } from "@/lib/fees/setup";

import { FeeServiceDialog } from "./fee-service-dialog";
import { useFeesError } from "./use-fees-error";

type Props = { yearId: string; services: FeeService[]; canManage: boolean };

const NEW_SERVICE = { name: "", nameAr: "", monthly: "", active: true };

/** The year's services: price per month, how many students use each, offered or not. */
export function FeeServicesList({ yearId, services, canManage }: Props) {
  const t = useTranslations("fees.services");
  const locale = useLocale();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {canManage && (
          <FeeServiceDialog
            yearId={yearId}
            defaults={NEW_SERVICE}
            open={creating}
            onOpenChange={setCreating}
            trigger={
              <Button size="sm" className="min-h-11">
                <Plus aria-hidden />
                {t("new")}
              </Button>
            }
          />
        )}
      </div>
      <Card className="py-0">
        {services.length === 0 ? (
          <EmptyState icon={Truck} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <ul className="divide-y">
            {services.map((s) => (
              <li key={s.id} data-fee-service={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <bdi className="font-medium">{serviceName(s, locale)}</bdi>
                  {s.nameAr && (
                    <bdi className="text-xs text-muted-foreground">{locale === "ar" ? s.name : s.nameAr}</bdi>
                  )}
                </span>
                <span className="font-numeric text-sm tabular-nums">
                  {t("perMonth", { amount: formatCentimes(s.monthly) })}
                </span>
                <span className="text-sm text-muted-foreground">{t("students", { count: s.students })}</span>
                <Badge variant={s.active ? "secondary" : "outline"}>{s.active ? t("active") : t("inactive")}</Badge>
                {canManage && <ServiceMenu yearId={yearId} service={s} name={serviceName(s, locale)} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ServiceMenu({ yearId, service, name }: { yearId: string; service: FeeService; name: string }) {
  const t = useTranslations("fees.services");
  const translateError = useFeesError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const defaults = {
    name: service.name,
    nameAr: service.nameAr ?? "",
    monthly: amountInputText(service.monthly),
    active: service.active,
  };
  const close = (open: boolean) => !open && setDialog(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error ?? "generic"));
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={t("menu", { name })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(
                () => updateFeeService(service.id, { ...defaults, active: !service.active }),
                t(service.active ? "deactivated" : "activated", { name }),
              )
            }
          >
            <Power aria-hidden />
            {t(service.active ? "deactivate" : "activate")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={service.students > 0} onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden />
            <span className="flex flex-col">
              {t("delete")}
              {service.students > 0 && <span className="text-xs text-muted-foreground">{t("inUseHint")}</span>}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeeServiceDialog
        yearId={yearId}
        serviceId={service.id}
        defaults={defaults}
        open={dialog === "edit"}
        onOpenChange={close}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={t("deleteTitle", { name })}
        description={t("deleteDescription")}
        pending={isPending}
        onConfirm={() => run(() => deleteFeeService(service.id), t("deleted", { name }))}
      />
    </>
  );
}
