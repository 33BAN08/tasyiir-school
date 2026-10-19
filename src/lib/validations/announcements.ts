import { z } from "zod";

// Announcements (Phase 9). Same limits as the announcements CHECKs. Error
// messages are `announcements.errors` keys.

export const ANNOUNCEMENT_SCOPES = ["school", "levels", "classes"] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const ANNOUNCEMENT_AUDIENCES = ["parents", "staff", "everyone"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const TITLE_MAX = 150;
export const BODY_MAX = 5000;

const title = z
  .string({ error: "titleRequired" })
  .trim()
  .min(1, { error: "titleRequired" })
  .max(TITLE_MAX, { error: "titleTooLong" });

const body = z
  .string({ error: "bodyRequired" })
  .trim()
  .min(1, { error: "bodyRequired" })
  .max(BODY_MAX, { error: "bodyTooLong" });

const ids = z.array(z.uuid({ error: "invalid" }), { error: "invalid" }).max(200, { error: "invalid" });

export const announcementSchema = z
  .object(
    {
      scope: z.enum(ANNOUNCEMENT_SCOPES, { error: "invalid" }),
      audience: z.enum(ANNOUNCEMENT_AUDIENCES, { error: "invalid" }),
      title,
      body,
      levelIds: ids,
      classIds: ids,
    },
    { error: "invalid" },
  )
  .superRefine((v, ctx) => {
    // Staff / everyone only for the whole school; levels / classes need at least one pick.
    if (v.scope !== "school" && v.audience !== "parents") ctx.addIssue({ code: "custom", message: "invalid", path: ["audience"] });
    if (v.scope === "levels" && v.levelIds.length === 0) ctx.addIssue({ code: "custom", message: "levelsRequired", path: ["levelIds"] });
    if (v.scope === "classes" && v.classIds.length === 0) ctx.addIssue({ code: "custom", message: "classesRequired", path: ["classIds"] });
  });
export type AnnouncementFormValues = z.input<typeof announcementSchema>;
export type AnnouncementValues = z.output<typeof announcementSchema>;

/** Editing changes the title and the text only: who it goes to is fixed once posted. */
export const announcementEditSchema = z.object({ title, body }, { error: "invalid" });
export type AnnouncementEditValues = z.input<typeof announcementEditSchema>;

export const announcementIdSchema = z.uuid({ error: "notFound" });
