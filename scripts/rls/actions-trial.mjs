// Launch prep step 2b: the trial through the app. requestDemo with kind 'trial'
// needs the e-mail; createTrialFromRequest (platform owner only, on the inbox
// page) makes the school, its director (temporary password, changed at first
// sign-in) and a 14-day "pro" trial capped at 50 students, links the request and
// marks it handled, never twice; when the trial has ended its director sees
// "Votre essai est terminé" on /suspended.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, anon } from "./fixtures.mjs";
import { removeDemoRequests, testPhone } from "./public-demo-requests.mjs";

const FILE = "src/lib/demo-requests/actions.ts";
const TRIAL_FILE = "src/lib/demo-requests/trial-actions.ts";
const INBOX = "/fr/platform/demo-requests";

export async function trialActions({ fx, baseUrl }) {
  const phone = testPhone();
  const email = `rls-test+${fx.run}-trialaction@example.com`;
  const local = `0${phone.slice(4)}`;
  const form = (overrides = {}) => ({
    kind: "trial",
    fullName: "RLS Trial Action",
    schoolName: "RLS École Essai Action",
    city: "Agadir",
    phone: local,
    email,
    students: "lt200",
    message: "",
    website: "",
    ...overrides,
  });
  const send = (values) => callAction(baseUrl, { id: actionId(FILE, "requestDemo"), path: "/fr", args: [values, "fr"] });
  const create = (requestId, cookies) =>
    callAction(baseUrl, { id: actionId(TRIAL_FILE, "createTrialFromRequest"), path: INBOX, args: [requestId], cookies });
  let schoolId = null;

  try {
    // --- The request -------------------------------------------------------------------------------------------
    const noEmail = await send(form({ email: "" }));
    check("[trial action] a trial request without an e-mail → email field", noEmail.ok === false && noEmail.field === "email" && noEmail.error === "emailRequired", JSON.stringify(noEmail));
    const sent = await send(form());
    check("[trial action] a trial request is sent", sent.ok === true, JSON.stringify(sent));
    const demoSent = await send(form({ kind: "demo", email: "" }));
    check("[trial action] a demo request still needs no e-mail", demoSent.ok === true, JSON.stringify(demoSent));
    const rows = (await admin.from("demo_requests").select("id, kind").eq("phone", phone)).data ?? [];
    const trialRow = rows.find((r) => r.kind === "trial");
    const demoRow = rows.find((r) => r.kind === "demo");
    check("[trial action] stored: one trial, one demo", rows.length === 2 && trialRow && demoRow);

    // --- Creating the trial ------------------------------------------------------------------------------------
    const dirCookies = await sessionCookies(fx.users.dirA);
    const ownerCookies = await sessionCookies(fx.users.owner);
    const byDirector = await create(trialRow.id, dirCookies);
    check("[trial action] a school director cannot create a trial", byDirector.ok === false && byDirector.error === "forbidden", JSON.stringify(byDirector));
    const onDemo = await create(demoRow.id, ownerCookies);
    check("[trial action] a demo request cannot become a trial", onDemo.ok === false && onDemo.error === "notFound", JSON.stringify(onDemo));

    const made = await create(trialRow.id, ownerCookies);
    check("[trial action] the platform owner creates the trial", made.ok === true && made.data?.password, JSON.stringify({ ...made, data: made.data && { ...made.data, password: "…" } }));
    if (!made.ok) return;
    schoolId = made.data.schoolId;
    fx.createdSchoolIds.push(schoolId);

    const school = (await admin.from("schools").select("name, city, status").eq("id", schoolId).single()).data;
    check("[trial action] school named after the request, active", school?.name === "RLS École Essai Action" && school.city === "Agadir" && school.status === "active");
    const sub = (await admin.from("school_subscriptions").select("status, max_students_override, trial_ends_at, plan:plans(key)").eq("school_id", schoolId).single()).data;
    const days = sub ? (Date.parse(sub.trial_ends_at) - Date.now()) / 86_400_000 : 0;
    check("[trial action] plan pro, trial, at most 50 students", sub?.plan?.key === "pro" && sub.status === "trial" && sub.max_students_override === 50, JSON.stringify(sub));
    check("[trial action] trial ends at the end of the 14th day", days > 14 && days <= 15, days.toFixed(2));
    const director = (await admin.from("profiles").select("id, full_name, locale, must_change_password, role:roles(key)").eq("school_id", schoolId)).data ?? [];
    check(
      "[trial action] one director, request's name and language, must change the password",
      director.length === 1 && director[0].role?.key === "director" && director[0].full_name === "RLS Trial Action" && director[0].locale === "fr" && director[0].must_change_password === true,
    );
    const signed = await anon().auth.signInWithPassword({ email, password: made.data.password });
    check("[trial action] the temporary password signs in", !signed.error, signed.error?.code);
    check(
      "[trial action] the WhatsApp link goes to the requester with the password",
      made.data.whatsappUrl.startsWith(`https://wa.me/${phone.slice(1)}?text=`) && decodeURIComponent(made.data.whatsappUrl).includes(made.data.password),
    );
    const linked = (await admin.from("demo_requests").select("school_id, handled_at, handled_by").eq("id", trialRow.id).single()).data;
    check("[trial action] the request is linked and marked handled by the owner", linked?.school_id === schoolId && linked.handled_at && linked.handled_by === fx.users.owner.id);
    const audit = (await admin.from("audit_logs").select("data").eq("school_id", schoolId).eq("action", "school.create_trial")).data ?? [];
    check("[trial action] audited, without the password", audit.length === 1 && !JSON.stringify(audit[0].data).includes(made.data.password));
    const again = await create(trialRow.id, ownerCookies);
    check("[trial action] never twice for one request", again.ok === false && again.error === "alreadyCreated", JSON.stringify(again));
    const inbox = await (await fetch(new URL(INBOX, baseUrl), { headers: { Cookie: ownerCookies } })).text();
    check("[trial action] the inbox shows the trial badge and the school link", inbox.includes('data-kind="trial"') && inbox.includes(`/fr/platform/schools/${schoolId}`));

    // --- After the trial ---------------------------------------------------------------------------------------
    await admin.from("profiles").update({ must_change_password: false }).eq("id", director[0].id);
    await admin.from("school_subscriptions").update({ trial_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("school_id", schoolId);
    await admin.rpc("run_trial_expiry", { p_now: new Date().toISOString(), p_schools: [schoolId] });
    const directorCookies = await sessionCookies({ email, password: made.data.password });
    const start = await fetch(new URL("/fr/dashboard", baseUrl), { redirect: "manual", headers: { Cookie: directorCookies } });
    const blockedTo = start.headers.get("location") ?? (await start.text()).match(/NEXT_REDIRECT;replace;([^;]+);/)?.[1] ?? "";
    check("[trial action] after the trial the director is sent to /suspended", blockedTo.includes("/suspended"), blockedTo || `status ${start.status}`);
    const page = await (await fetch(new URL("/fr/suspended", baseUrl), { headers: { Cookie: directorCookies } })).text();
    check("[trial action] /suspended says the trial has ended", page.includes('data-blocked="trial_ended"'));
  } finally {
    await removeDemoRequests([phone]);
  }
}
