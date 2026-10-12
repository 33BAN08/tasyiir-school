import { AppShell } from "@/components/layout/app-shell";

export default function SchoolLayout({ children }: LayoutProps<"/[locale]">) {
  return <AppShell area="school">{children}</AppShell>;
}
