import type { UseFormReturn } from "react-hook-form";

import type { NewSchoolFormValues, NewSchoolInput } from "@/lib/validations/platform";

/** The wizard's form: raw string values in, zod-transformed values out. */
export type NewSchoolForm = UseFormReturn<NewSchoolFormValues, unknown, NewSchoolInput>;
