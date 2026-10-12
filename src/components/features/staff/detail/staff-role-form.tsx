"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { labelledRoles } from "@/lib/auth/roles";
import { changeStaffRole } from "@/lib/staff/member-actions";
import type { StaffRole } from "@/lib/staff/staff";

import { useStaffError } from "../use-staff-error";
import { BlockedNote } from "./blocked-note";

type Props = {
  staffId: string;
  currentRole: StaffRole;
  /** Roles the viewer may assign (the current role is always shown). */
  roles: StaffRole[];
  /** Rule key when the role cannot be changed. */
  blocked: string | null;
};

export function StaffRoleForm({ staffId, currentRole, roles, blocked }: Props) {
  const t = useTranslations("staff.detail.role");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  const translateError = useStaffError();
  const router = useRouter();
  const [roleId, setRoleId] = useState(currentRole.id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = labelledRoles(
    roles.some((r) => r.id === currentRole.id) ? roles : [currentRole, ...roles],
    tRoles,
    locale,
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await changeStaffRole(staffId, { roleId });
      if (!result.ok) {
        if (result.field) setError(result.error);
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="staff-detail-role">{t("label")}</FieldLabel>
          <Select value={roleId} onValueChange={setRoleId} disabled={blocked !== null}>
            <SelectTrigger id="staff-detail-role" className="w-full sm:w-72" aria-invalid={!!error}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <FieldError>{translateError(error)}</FieldError>}
        </Field>
        {blocked ? (
          <BlockedNote reason={blocked} />
        ) : (
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={isPending || roleId === currentRole.id}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
