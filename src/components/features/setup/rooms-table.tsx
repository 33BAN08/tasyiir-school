"use client";

import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteRoom } from "@/lib/structure/room-actions";
import type { Room } from "@/lib/structure/rooms";

import { EditDeleteMenu } from "./edit-delete-menu";
import { RoomDialog } from "./room-dialog";

export function RoomsTable({ rooms }: { rooms: Room[] }) {
  const t = useTranslations("setup.rooms");
  const tTypes = useTranslations("setup.rooms.types");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.type")}</TableHead>
          <TableHead className="text-end">{t("columns.capacity")}</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">{t("columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell className="font-medium">{room.name}</TableCell>
            <TableCell className="text-muted-foreground">{room.roomType ? tTypes(room.roomType) : t("form.noType")}</TableCell>
            <TableCell className="text-end font-numeric tabular-nums">
              {t("seats", { count: room.capacity })}
            </TableCell>
            <TableCell>
              <EditDeleteMenu
                label={t("actions", { name: room.name })}
                editDialog={(props) => (
                  <RoomDialog
                    roomId={room.id}
                    defaults={{ name: room.name, capacity: String(room.capacity), roomType: room.roomType ?? "" }}
                    {...props}
                  />
                )}
                deleteTitle={t("delete.title", { name: room.name })}
                deleteDescription={t("delete.description")}
                onDelete={() => deleteRoom(room.id)}
                deletedMessage={t("delete.done", { name: room.name })}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
