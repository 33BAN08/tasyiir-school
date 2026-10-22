// Public home page: the page itself (no session needed, /start for signed-in
// users) and its Server Actions — requestDemo (anyone, honeypot, limits answered
// as `limited`, never an error) and setDemoRequestHandled (platform owner only).
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { removeDemoRequests, testPhone } from "./public-demo-requests.mjs";

const FILE = "src/lib/demo-requests/actions.ts";
const PLATFORM_FILE = "src/lib/demo-requests/platform-actions.ts";

export async function demoRequestActions({ fx, baseUrl }) {
  const phone = testPhone();
  const bot = testPhone();
  const local = `0${phone.slice(4, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)} ${phone.slice(9, 11)} ${phone.slice(11)}`;
  const form = (overrides = {}) => ({
    fullName: "RLS Demo Action",
    schoolName: "RLS École Action",
    city: "Fès",
    phone: local,
    email: "",
    students: "lt200",
    message: "",
    website: "",
    ...overrides,
  });
  const send = (values, cookies) => callAction(baseUrl, { id: actionId(FILE, "requestDemo"), path: "/fr", args: [values, "fr"], cookies });
  const stored = async (p) => (await admin.from("demo_requests").select("id, phone, locale").eq("phone", p)).data ?? [];

  try {
    // --- The page ------------------------------------------------------------------------------------------
    const home = await fetch(new URL("/fr", baseUrl), { redirect: "manual" });
    const html = home.status === 200 ? await home.text() : "";
    check("[home] /fr is public: the home page, signed out", home.status === 200 && html.includes('id="hero-title"'), `status ${home.status}`);
    check("[home] …with the demo form", html.includes('id="demo-phone"'));
    // Pricing (launch step 5): real prices, Western digits, unfinished modules only in "Bientôt".
    const dh = (n) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)} DH`;
    for (const locale of ["fr", "ar"]) {
      const page = locale === "fr" ? html : await (await fetch(new URL(`/${locale}`, baseUrl))).text();
      const plans = page.slice(page.indexOf('<section id="plans"'), page.indexOf('<section id="soon"'));
      check(`[home ${locale}] three plans, then the coming-soon section`, plans.length > 0 && ["small", "medium", "large"].every((p) => plans.includes(`id="plan-${p}"`)));
      check(
        `[home ${locale}] monthly + yearly prices and savings in DH`,
        [290, 590, 990, 2900, 5900, 9900, 580, 1180, 1980].every((n) => plans.includes(dh(n))),
      );
      check(`[home ${locale}] no Arabic-Indic digits in the plans`, !/[٠-٩۰-۹]/.test(plans));
      const soon = page.slice(page.indexOf('<section id="soon"'));
      check(`[home ${locale}] coming-soon modules listed under the plans`, (soon.match(/data-soon-item=/g) ?? []).length === 6);
      check(`[home ${locale}] no coming-soon module inside a plan`, !plans.includes("data-soon-item="));
      check(
        `[home ${locale}] comparison table: what differs, then what every plan has`,
        plans.includes('data-compare="differences"') && plans.includes('data-compare="allPlans"'),
      );
      check(`[home ${locale}] the product on 4 phones`, (page.match(/data-showcase="/g) ?? []).length === 4);
      check(`[home ${locale}] no monthly / annual switch left`, !plans.includes("aria-pressed"));
    }
    check("[home] no 'Prix sur demande' left", !html.includes("Prix sur demande"));
    const banner = html.slice(html.indexOf("data-founding-banner"), html.indexOf('id="plan-small"'));
    check(
      "[home] founding banner carries its button (shown on phones too)",
      /En parler sur WhatsApp|Nous contacter/.test(banner) && !banner.includes("hidden shrink-0"),
    );
    const start = await fetch(new URL("/fr/start", baseUrl), { redirect: "manual" });
    check("[home] /fr/start signed out → sign-in", start.status === 307 && start.headers.get("location")?.includes("/fr/login"), `status ${start.status}`);
    const dirCookies = await sessionCookies(fx.users.dirA);
    const login = await fetch(new URL("/fr/login", baseUrl), { redirect: "manual", headers: { Cookie: dirCookies } });
    check("[home] /fr/login signed in → /fr/start (the user's area)", login.headers.get("location")?.endsWith("/fr/start"), login.headers.get("location") ?? `status ${login.status}`);

    // --- requestDemo ---------------------------------------------------------------------------------------
    const sent = await send(form());
    check("[demo action] a visitor's request is sent (phone typed 06 xx …)", sent.ok === true && sent.data?.phone === phone, JSON.stringify(sent));
    const rowsNow = await stored(phone);
    check("[demo action] …stored once, phone as +212…, the page's language", rowsNow.length === 1 && rowsNow[0].locale === "fr");
    const signedIn = await send(form(), dirCookies);
    check("[demo action] a signed-in visitor can send one too (inserted as anon)", signedIn.ok === true, JSON.stringify(signedIn));
    const trap = await send(form({ phone: `0${bot.slice(4)}`, website: "http://spam.example" }));
    check("[demo action] honeypot filled: answered 'sent'…", trap.ok === true);
    check("[demo action] …but nothing stored", (await stored(bot)).length === 0);
    const badPhone = await send(form({ phone: "0522123456" }));
    check("[demo action] a landline is refused on the phone field", badPhone.ok === false && badPhone.field === "phone" && badPhone.error === "phone", JSON.stringify(badPhone));
    const noRange = await send(form({ students: "" }));
    check("[demo action] no student range → students field", noRange.ok === false && noRange.field === "students");
    await send(form());
    const limited = await send(form());
    check("[demo action] a 4th request in 24 h: `limited: phone`, not an error", limited.ok === false && limited.limited === "phone" && !limited.error, JSON.stringify(limited));

    // --- setDemoRequestHandled -----------------------------------------------------------------------------
    const target = rowsNow[0].id;
    const handle = (cookies, handled) =>
      callAction(baseUrl, { id: actionId(PLATFORM_FILE, "setDemoRequestHandled"), path: "/fr/platform/demo-requests", args: [target, handled], cookies });
    const byDirector = await handle(dirCookies, true);
    check("[demo action] a school director cannot mark a request handled", byDirector.ok === false);
    const ownerCookies = await sessionCookies(fx.users.owner);
    const byOwner = await handle(ownerCookies, true);
    const after = (await admin.from("demo_requests").select("handled_at, handled_by").eq("id", target).single()).data;
    check("[demo action] the platform owner marks it handled", byOwner.ok === true && after.handled_at && after.handled_by === fx.users.owner.id, JSON.stringify(byOwner));
    const page = await fetch(new URL("/fr/platform/demo-requests", baseUrl), { headers: { Cookie: ownerCookies } });
    check("[demo action] the platform owner's inbox lists it", page.status === 200 && (await page.text()).includes("RLS École Action"));
  } finally {
    await removeDemoRequests([phone, bot]);
  }
}
