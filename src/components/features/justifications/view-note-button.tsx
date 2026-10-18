"use client";

import { Paperclip } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getJustificationFileUrl } from "@/lib/justifications/actions";

type Props = { id: string; label: string; translateError: (key: string) => string };

/** Opens a justification's note in a new tab through a 60-second signed link made on tap. */
export function ViewNoteButton({ id, label, translateError }: Props) {
  const [isPending, startTransition] = useTransition();

  function open() {
    // The tab is opened now (a tap), the signed link filled in once the server answers.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const result = await getJustificationFileUrl(id);
      if (!result.ok) {
        tab?.close();
        toast.error(translateError(result.error));
        return;
      }
      if (tab) tab.location.href = result.data.url;
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending} onClick={open}>
      <Paperclip aria-hidden />
      {label}
    </Button>
  );
}
