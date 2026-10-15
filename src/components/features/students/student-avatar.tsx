import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  /** Signed URL of the photo (null: no photo, or not allowed). */
  url: string | null;
  /** Shown when there is no photo (studentInitials()). */
  initials: string;
  alt: string;
  className?: string;
};

/** Student photo, or initials. A plain <img>: private photos never go through the image optimizer. */
export function StudentAvatar({ url, initials, alt, className }: Props) {
  return (
    <Avatar className={cn("size-9", className)}>
      {url && <AvatarImage src={url} alt={alt} className="object-cover" />}
      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
}
