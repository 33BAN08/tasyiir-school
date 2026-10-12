"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "@/i18n/navigation";
import { setRolePermissions } from "@/lib/roles/actions";
import type { PermissionGroup } from "@/lib/roles/roles";

import { useRoleError } from "./use-role-error";

type Props = {
  roleId: string;
  groups: PermissionGroup[];
  initial: string[];
  /** Rule key when the whole grid is read-only (e.g. the director role). */
  blocked: string | null;
  /** Permissions the viewer may not grant or remove (not held by a non-director). */
  lockedKeys: string[];
};

export function RolePermissionsForm({ roleId, groups, initial, blocked, lockedKeys }: Props) {
  const t = useTranslations("staffRoles.permissionsCard");
  const tPerm = useTranslations("permissions");
  const tModules = useTranslations("modules");
  const translateError = useRoleError();
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(initial));
  const [isPending, startTransition] = useTransition();

  const dirty = selected.size !== initial.length || initial.some((p) => !selected.has(p));
  const label = (key: string, part: "label" | "description") => {
    const k = `${key}.${part}` as Parameters<typeof tPerm>[0];
    return tPerm.has(k) ? tPerm(k) : key;
  };

  function toggle(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await setRolePermissions(roleId, { permissions: [...selected] });
      if (!result.ok) {
        toast.error(translateError(result.error));
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
        {groups.map((group) => (
          <fieldset key={group.moduleKey ?? "core"} className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">
              {group.moduleKey ? tModules(group.moduleKey as Parameters<typeof tModules>[0]) : t("core")}
            </legend>
            {group.permissions.map((key) => {
              const id = `perm-${key}`;
              const locked = blocked !== null || lockedKeys.includes(key);
              return (
                <div key={key} className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={selected.has(key)}
                    disabled={locked || isPending}
                    onCheckedChange={(v) => toggle(key, v === true)}
                    aria-describedby={`${id}-desc`}
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
                      {label(key, "label")}
                      {locked && !blocked && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                    </label>
                    <p id={`${id}-desc`} className="text-sm text-muted-foreground">
                      {label(key, "description")}
                    </p>
                  </div>
                </div>
              );
            })}
          </fieldset>
        ))}
        {blocked ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {translateError(blocked)}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {lockedKeys.length > 0 && t("lockedHint")}
            </p>
            <Button type="button" onClick={save} disabled={isPending || !dirty}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
