"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearAllDrafts } from "@/lib/attendance/drafts";
import { signOut } from "@/lib/auth/actions";

type Props = { name: string; email: string | null; roleLabel: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ name, email, roleLabel }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("shell.accountMenu")}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="font-medium text-foreground">{name}</span>
          {email && (
            <span className="text-xs text-muted-foreground" dir="ltr">
              {email}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isPending}
          onSelect={() => {
            clearAllDrafts(); // roll calls kept on this phone (Phase 7)
            startTransition(() => signOut(locale));
          }}
        >
          <LogOut className="rtl:-scale-x-100" aria-hidden />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
