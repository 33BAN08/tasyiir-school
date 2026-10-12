"use client";

import { CheckCircle2, MinusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setModuleOverride } from "@/lib/platform/school-actions";
import { MODULE_OVERRIDES, type ModuleOverride } from "@/lib/validations/platform";

type Props = {
  schoolId: string;
  modules: string[];
  planModules: string[];
  overrides: Record<string, boolean>;
};

/** Per-module switch. Effective state = override if any, else the plan (like private.has_module()). */
export function ModuleOverrides({ schoolId, modules, planModules, overrides }: Props) {
  const t = useTranslations("platform.schoolDetail.modules");
  const tModules = useTranslations("modules");
  const tErrors = useTranslations("platform.errors");
  const [isPending, startTransition] = useTransition();

  function change(moduleKey: string, override: ModuleOverride) {
    startTransition(async () => {
      const result = await setModuleOverride(schoolId, { moduleKey, override });
      if (!result.ok) toast.error(tErrors(result.error));
      else toast.success(t("saved", { module: tModules(moduleKey) }));
    });
  }

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("module")}</TableHead>
              <TableHead>{t("inPlan")}</TableHead>
              <TableHead>{t("setting")}</TableHead>
              <TableHead className="pe-4">{t("effective")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((key) => {
              const override: ModuleOverride =
                key in overrides ? (overrides[key] ? "on" : "off") : "plan";
              const inPlan = planModules.includes(key);
              const enabled = override === "plan" ? inPlan : override === "on";
              return (
                <TableRow key={key}>
                  <TableCell className="ps-4 font-medium">{tModules(key)}</TableCell>
                  <TableCell>
                    <OnOff on={inPlan} label={inPlan ? t("yes") : t("no")} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={override}
                      onValueChange={(value) => change(key, value as ModuleOverride)}
                      disabled={isPending}
                    >
                      <SelectTrigger size="sm" className="w-40" aria-label={t("settingFor", { module: tModules(key) })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODULE_OVERRIDES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {t(`override.${o}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="pe-4">
                    <OnOff on={enabled} label={enabled ? t("enabled") : t("disabled")} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OnOff({ on, label }: { on: boolean; label: string }) {
  const Icon = on ? CheckCircle2 : MinusCircle;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className={on ? "size-4 text-success" : "size-4 text-muted-foreground"} aria-hidden />
      {label}
    </span>
  );
}
