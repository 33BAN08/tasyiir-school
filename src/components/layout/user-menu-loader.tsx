import { getTranslations } from "next-intl/server";

import { isBuiltInRole } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import { UserMenu } from "./user-menu";

export async function UserMenuLoader() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("roles")]);
  if (!user) return null;

  const roleLabel = isBuiltInRole(user.roleKey) ? t(user.roleKey) : user.roleName;
  return <UserMenu name={user.fullName} email={user.email} roleLabel={roleLabel} />;
}
