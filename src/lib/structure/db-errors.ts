// Turns a Postgres error from a session-client write into a `setup.errors` key.
// The database is the final judge (RLS, unique, exclusion, check, foreign
// keys); the Server Actions only pre-check what they can explain better.

type PgError = { code?: string; message?: string; details?: string | null };

/** `byConstraint`: constraint name → error key, for errors that name one. */
export function dbErrorKey(error: PgError, byConstraint: Record<string, string> = {}): string {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const named = Object.entries(byConstraint).find(([constraint]) => text.includes(constraint));
  if (named) return named[1];
  switch (error.code) {
    case "42501": // RLS refused the row (no permission, other school, suspended)
      return "forbidden";
    case "23503": // still referenced (classes of a year, …)
      return "inUse";
    default:
      return "generic";
  }
}
