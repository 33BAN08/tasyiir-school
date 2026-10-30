"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { amountInputText, formatCentimes, formatPercent, percentInputText } from "@/lib/fees/money";
import type { StudentDiscount } from "@/lib/fees/setup";
import { deleteStudentDiscount } from "@/lib/fees/student-actions";
import { DISCOUNT_KINDS } from "@/lib/validations/fees";

import { DiscountDialog, type DiscountDraft } from "./discount-dialog";
import { useFeesError } from "./use-fees-error";

type Props = {
  studentId: string;
  yearId: string;
  discounts: StudentDiscount[];
  /** fees.cancel (director by default): add, change, delete. */
  canCancel: boolean;
};

/** The student's discounts this year. A fixed amount reads "par mois" (once on the registration). */
export function StudentDiscountsBlock({ studentId, yearId, discounts, canCancel }: Props) {
  const t = useTranslations("fees.student.discounts");
  const [adding, setAdding] = useState(false);
  const freeKinds = DISCOUNT_KINDS.filter((k) => !discounts.some((d) => d.kind === k));
  const valueText = (d: StudentDiscount) =>
    d.percentBp !== null
      ? formatPercent(d.percentBp)
      : t(d.appliesTo === "registration" ? "once" : "perMonth", { amount: formatCentimes(d.amountCentimes ?? 0) });

  return (
    <section className="flex flex-col gap-2" aria-labelledby="student-fee-discounts">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 id="student-fee-discounts" className="text-sm font-semibold">
          {t("title")}
        </h3>
        {canCancel && freeKinds.length > 0 && (
          <DiscountDialog
            studentId={studentId}
            yearId={yearId}
            kinds={freeKinds}
            defaults={{ kind: freeKinds[0], mode: "percent", value: "", appliesTo: "tuition", reason: "" }}
            open={adding}
            onOpenChange={setAdding}
            trigger={
              <Button variant="outline" size="sm" className="min-h-11">
                <Plus aria-hidden />
                {t("add")}
              </Button>
            }
          />
        )}
      </div>
      {discounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {discounts.map((d) => (
            <li key={d.id} data-student-discount={d.kind} className="flex items-center gap-2 px-3 py-2">
              {/* Phone: kind · value · target, the reason on its own line below. */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">{t(`kinds.${d.kind}`)}</span>
                  <span className="font-numeric text-sm tabular-nums">{valueText(d)}</span>
                  <span className="text-sm text-muted-foreground">{t(`targets.${d.appliesTo}`)}</span>
                </div>
                {d.reason && <bdi className="min-w-0 text-sm break-words text-muted-foreground sm:truncate">{d.reason}</bdi>}
              </div>
              {canCancel && <DiscountMenu studentId={studentId} yearId={yearId} discount={d} />}
            </li>
          ))}
        </ul>
      )}
      {!canCancel && <p className="text-xs text-muted-foreground">{t("directionOnly")}</p>}
    </section>
  );
}

function DiscountMenu({ studentId, yearId, discount }: { studentId: string; yearId: string; discount: StudentDiscount }) {
  const t = useTranslations("fees.student.discounts");
  const translateError = useFeesError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = (open: boolean) => !open && setDialog(null);
  const kind = t(`kinds.${discount.kind}`);
  const defaults: DiscountDraft = {
    kind: discount.kind,
    mode: discount.percentBp !== null ? "percent" : "amount",
    value: discount.percentBp !== null ? percentInputText(discount.percentBp) : amountInputText(discount.amountCentimes),
    appliesTo: discount.appliesTo,
    reason: discount.reason ?? "",
  };

  function remove() {
    startTransition(async () => {
      const result = await deleteStudentDiscount(discount.id);
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={t("menu", { kind })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DiscountDialog
        studentId={studentId}
        yearId={yearId}
        discountId={discount.id}
        kinds={[discount.kind]}
        defaults={defaults}
        open={dialog === "edit"}
        onOpenChange={close}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={t("deleteTitle", { kind })}
        description={t("deleteDescription")}
        pending={isPending}
        onConfirm={remove}
      />
    </>
  );
}
