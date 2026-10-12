import { getTranslations } from "next-intl/server";

import { roleLabel } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import { UserMenu } from "./user-menu";

export async function UserMenuLoader() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("roles")]);
  if (!user) return null;

  return (
    <UserMenu
      name={user.fullName}
      email={user.email}
      roleLabel={roleLabel({ key: user.roleKey, name: user.roleName }, t)}
    />
  );
}
