// Room types: same list as the rooms_type_check constraint; translated under
// `setup.rooms.types`.
export const ROOM_TYPES = ["classroom", "lab", "computer_lab", "gym"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
