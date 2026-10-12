import { MobileShell } from "@/components/layout/mobile-shell";

/** Parents and students (mobile-first). */
export default function ParentLayout({ children }: LayoutProps<"/[locale]">) {
  return <MobileShell>{children}</MobileShell>;
}
