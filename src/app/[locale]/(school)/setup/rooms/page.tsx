import { DoorOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewRoomButton } from "@/components/features/setup/new-room-button";
import { RoomsTable } from "@/components/features/setup/rooms-table";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listRooms } from "@/lib/structure/rooms";

export default async function RoomsPage() {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<RoomsSkeleton />}>
        <RoomsSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function RoomsSection({ schoolId }: { schoolId: string }) {
  const [rooms, t] = await Promise.all([listRooms(schoolId), getTranslations("setup.rooms")]);
  const seats = rooms.reduce((sum, r) => sum + r.capacity, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {rooms.length > 0 && <NewRoomButton />}
      </div>
      <Card className="py-0">
        {rooms.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={<NewRoomButton />}
          />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            <RoomsTable rooms={rooms} />
            <p className="px-4 text-sm text-muted-foreground">{t("count", { count: rooms.length, seats })}</p>
          </div>
        )}
      </Card>
    </section>
  );
}

function RoomsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
