import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

/** Unknown paths inside a locale render the localized not-found page. */
export default function CatchAllPage() {
  return (
    <Suspense>
      <NotFoundAtRequestTime />
    </Suspense>
  );
}

// A prerendered notFound() would bake an error shell; throw it per request instead.
async function NotFoundAtRequestTime(): Promise<never> {
  await connection();
  notFound();
}
