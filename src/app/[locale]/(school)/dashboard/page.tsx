import { TeacherHome } from "@/components/features/teacher-home/teacher-home";
import { WelcomePlaceholder } from "@/components/layout/welcome-placeholder";
import { requireArea } from "@/lib/auth/session";

/** School home: the teacher's day for teachers (Madar app refresh, 2026-10-25); other roles keep the placeholder for now. */
export default async function SchoolDashboardPage() {
  // Page-level check: must run before anything is rendered.
  const user = await requireArea("school");
  if (user.roleKey === "teacher" && user.schoolId) return <TeacherHome user={{ ...user, schoolId: user.schoolId }} />;
  return <WelcomePlaceholder area="school" titleKey="schoolTitle" />;
}
