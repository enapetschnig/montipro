// Probefahrt 07.11.2026 (Christoph, Nachtschicht: „column employees.kategorie does not exist“):
// Die Plantafel liest die Rolle aus user_roles statt aus der nicht vorhandenen Spalte employees.kategorie.
// Admin und Vorarbeiter bleiben auf der Plantafel und dürfen bearbeiten, Mitarbeiter hat keinen Zugriff, keine Fehl-Abfrage.
// Läuft NUR gegen die Testumgebung (testumgebung.mjs start), App mit VITE_SUPABASE_URL auf die Testumgebung:
// TEST_API_URL=… TEST_ANON_KEY=… TEST_SERVICE_ROLE_KEY=… TEST_APP_URL=http://127.0.0.1:55510 npx playwright test -c tests/roboter/playwright.config.ts
import { expect, test, type Page } from "@playwright/test";

const API = process.env.TEST_API_URL ?? "";
const ANON = process.env.TEST_ANON_KEY ?? "";
const SR = process.env.TEST_SERVICE_ROLE_KEY ?? "";
const APP = process.env.TEST_APP_URL ?? "http://127.0.0.1:55510";

test.skip(!API || !SR || !ANON, "nur mit Testumgebung");

const kopf = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
async function rest(pfad: string, methode: string, daten?: unknown) {
  const r = await fetch(`${API}${pfad}`, { method: methode, headers: { ...kopf, Prefer: "return=representation" }, body: daten ? JSON.stringify(daten) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

async function anmelden(page: Page, rolle: string) {
  const email = `zztest.${rolle}.${Date.now()}@example.invalid`;
  const password = "Test1234!x";
  const u = await rest("/auth/v1/admin/users", "POST", { email, password, email_confirm: true, user_metadata: { vorname: rolle, nachname: "Probe", username: `zztest${rolle}${Date.now()}` } });
  await rest(`/rest/v1/profiles?id=eq.${u.id}`, "PATCH", { vorname: rolle, nachname: "Probe", is_active: true });
  await rest(`/rest/v1/user_roles?user_id=eq.${u.id}`, "DELETE");
  await rest("/rest/v1/user_roles", "POST", { user_id: u.id, role: rolle });
  const sitzung = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  await page.goto(`${APP}/auth`);
  await page.evaluate((s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)), sitzung);
}

function fehlabfragenMerken(page: Page) {
  const fehl: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/employees") && r.status() >= 400) fehl.push(`${r.status()} ${r.url()}`);
  });
  return fehl;
}

for (const rolle of ["administrator", "vorarbeiter"]) {
  test(`${rolle}: bleibt auf der Plantafel und darf bearbeiten`, async ({ page }) => {
    const fehl = fehlabfragenMerken(page);
    await anmelden(page, rolle);
    await page.goto(`${APP}/schedule`);
    await expect(page.locator("header").getByRole("heading", { name: "Plantafel" })).toBeVisible();
    await expect(page.getByTitle("Projekt hinzufügen")).toBeVisible();
    await page.waitForTimeout(1500); // Rückwurf aufs Dashboard käme nach dem Laden der Rechte
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.getByTitle("Projekt hinzufügen")).toBeVisible();
    expect(fehl).toEqual([]);
  });
}

test("mitarbeiter: kein Zugriff auf die Plantafel", async ({ page }) => {
  const fehl = fehlabfragenMerken(page);
  await anmelden(page, "mitarbeiter");
  await page.goto(`${APP}/schedule`);
  await expect(page.getByText("Kein Zugriff")).toBeVisible();
  await expect(page.getByTitle("Projekt hinzufügen")).toHaveCount(0);
  expect(fehl).toEqual([]);
});
