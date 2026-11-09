// Grundablauf Rechte (09.11.2026): Was jede Rolle sehen darf, steht in role_permissions (Admin pflegt das).
// Die Oberfläche muss sich genau daran halten – und die Datenbank muss es auch ohne Oberfläche durchsetzen.
// Feste Kundenregeln obendrauf: Mitarbeiter sehen keine Rechnungen/Admin/Stundenauswertung, aber Eingangsrechnungen
// am Handy („Ich muss den Menüpunkt am Handy sehen !!!“, April 2026).
import { expect, test } from "@playwright/test";
import { APP, alsKonto, anmelden, dienst, freierTag, konto, nurTestumgebung, wache, type Rolle } from "./grundtest-hilfe";

nurTestumgebung();

const SEITEN: Record<string, string> = {
  rechnungen: "/invoices",
  admin: "/admin",
  stundenauswertung: "/hours-report",
  plantafel: "/schedule",
  kalender: "/calendar",
  bautagesberichte: "/bautagesberichte",
  ersttermine: "/ersttermine",
  protokolle: "/besprechungsprotokolle",
  kunden: "/customers",
  materialien: "/materials",
  eingangsrechnungen: "/eingangsrechnungen",
};

for (const rolle of ["administrator", "vorarbeiter", "mitarbeiter"] as Rolle[]) {
  test(`${rolle}: jede Seite genau nach role_permissions`, async ({ page }) => {
    const rechte = await dienst<{ feature: string; can_view: boolean }[]>(`/rest/v1/role_permissions?role=eq.${rolle}&select=feature,can_view`);
    const darf = (f: string) => rechte.find((r) => r.feature === f)?.can_view === true;
    const w = wache(page);
    await anmelden(page, await konto(rolle));
    for (const [feature, pfad] of Object.entries(SEITEN)) {
      await page.goto(`${APP}${pfad}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const gesperrt = page.getByText("Du hast keine Berechtigung für diesen Bereich.");
      if (darf(feature)) {
        await page.waitForTimeout(500);
        await expect(gesperrt, `${rolle} ${pfad} sollte offen sein`).toHaveCount(0);
        await expect(page, `${rolle} ${pfad}`).not.toHaveURL(/\/auth/);
      } else {
        await expect(gesperrt, `${rolle} ${pfad} sollte gesperrt sein`).toBeVisible();
      }
    }
    expect(w.abstuerze).toEqual([]);
  });
}

test("Feste Kundenregeln stehen so in role_permissions", async () => {
  const alle = await dienst<{ role: string; feature: string; can_view: boolean }[]>("/rest/v1/role_permissions?select=role,feature,can_view");
  const darf = (r: string, f: string) => alle.find((x) => x.role === r && x.feature === f)?.can_view === true;
  for (const f of Object.keys(SEITEN)) expect(darf("administrator", f), `administrator ${f}`).toBe(true);
  for (const f of ["rechnungen", "admin", "stundenauswertung"]) expect(darf("mitarbeiter", f), `mitarbeiter ${f}`).toBe(false);
  expect(darf("mitarbeiter", "eingangsrechnungen")).toBe(true);
  expect(darf("mitarbeiter", "zeiterfassung")).toBe(true);
  expect(darf("vorarbeiter", "bautagesberichte")).toBe(true);
});

test("Mitarbeiter am Handy: Eingangsrechnungen sichtbar, Rechnungen und Admin nicht", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route(/\.supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
  const page = await ctx.newPage();
  await anmelden(page, await konto("mitarbeiter"));
  await expect(page.getByText("Eingangsrechnungen").first()).toBeVisible();
  await expect(page.getByText("Rechnungen & Angebote")).toHaveCount(0);
  await expect(page.getByText("Admin-Bereich")).toHaveCount(0);
  await ctx.close();
});

test("Datenbank: Mitarbeiter sieht nur eigene Stunden und keine Rechnungen, kann sich nicht zum Admin machen", async () => {
  const ma = await konto("mitarbeiter");
  const admin = await konto("administrator");
  const fremd = await dienst<{ id: string }[]>("/rest/v1/time_entries", "POST", {
    user_id: admin.id, datum: freierTag(), stunden: 2, taetigkeit: "ZZTEST fremd", start_time: "07:00", end_time: "09:00",
  });
  const [re] = await dienst<{ id: string }[]>("/rest/v1/invoices", "POST", {
    user_id: admin.id, typ: "rechnung", nummer: `ZZTEST-${Date.now().toString(36)}`, laufnummer: 990000 + (Date.now() % 9000), kunde_name: "ZZTEST Kunde", status: "entwurf",
  });

  const stunden = await (await alsKonto(ma, "/rest/v1/time_entries?select=user_id")).json();
  expect(stunden.every((s: { user_id: string }) => s.user_id === ma.id)).toBe(true);
  expect(await (await alsKonto(ma, `/rest/v1/time_entries?id=eq.${fremd[0].id}&select=id`)).json()).toEqual([]);
  expect(await (await alsKonto(ma, `/rest/v1/invoices?id=eq.${re.id}&select=id`)).json()).toEqual([]);

  // Rechte ausweiten oder sich selbst eine Rolle geben geht nicht.
  await alsKonto(ma, "/rest/v1/user_roles", "POST", { user_id: ma.id, role: "administrator" });
  await alsKonto(ma, "/rest/v1/role_permissions?role=eq.mitarbeiter&feature=eq.rechnungen", "PATCH", { can_view: true });
  const rollen = await dienst<{ role: string }[]>(`/rest/v1/user_roles?user_id=eq.${ma.id}&select=role`);
  expect(rollen.map((r) => r.role)).toEqual(["mitarbeiter"]);
  const [p] = await dienst<{ can_view: boolean }[]>("/rest/v1/role_permissions?role=eq.mitarbeiter&feature=eq.rechnungen&select=can_view");
  expect(p.can_view).toBe(false);

  // Fremde Stunden ändern oder löschen geht nicht.
  await alsKonto(ma, `/rest/v1/time_entries?id=eq.${fremd[0].id}`, "PATCH", { stunden: 99 });
  await alsKonto(ma, `/rest/v1/time_entries?id=eq.${fremd[0].id}`, "DELETE");
  const [nachher] = await dienst<{ stunden: number }[]>(`/rest/v1/time_entries?id=eq.${fremd[0].id}&select=stunden`);
  expect(Number(nachher.stunden)).toBe(2);

  await dienst(`/rest/v1/time_entries?id=eq.${fremd[0].id}`, "DELETE");
  await dienst(`/rest/v1/invoices?id=eq.${re.id}`, "DELETE");
});
