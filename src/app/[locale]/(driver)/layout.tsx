import { MobileShell } from "@/components/layout/mobile-shell";

export default function DriverLayout({ children }: LayoutProps<"/[locale]">) {
  return <MobileShell>{children}</MobileShell>;
}
