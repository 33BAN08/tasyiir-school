import { AccessBlockedCard } from "@/components/features/auth/access-blocked-card";

export default function SuspendedPage() {
  return <AccessBlockedCard reason="suspended" />;
}
