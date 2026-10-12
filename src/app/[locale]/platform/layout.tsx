import { AppShell } from "@/components/layout/app-shell";

export default function PlatformLayout({ children }: LayoutProps<"/[locale]/platform">) {
  return <AppShell area="platform">{children}</AppShell>;
}
