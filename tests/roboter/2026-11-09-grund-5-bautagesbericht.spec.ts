// Grundablauf Bautagesbericht (09.11.2026): Vorarbeiter legt auf der Baustelle einen Bericht an, er bekommt eine
// BTB-Nummer, steht in der Liste, und das PDF landet automatisch im Projektordner (project-reports/…/berichte).
import { expect, test } from "@playwright/test";
import { API, APP, anmelden, dienst, konto, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Vorarbeiter: Bautagesbericht anlegen, Nummer, in der Liste, PDF im Projektordner", async ({ page }) => {
  const va = await konto("vorarbeiter");
  const { projektId, marke } = await testProjekt("Baustelle", [va]);
  const w = wache(page);
  await anmelden(page, va);

  await page.goto(`${APP}/bautagesberichte`);
  await page.getByRole("button", { name: "Neuer Bericht" }).click();
  await expect(page).toHaveURL(/\/bautagesberichte\/neu/);
  await page.getByRole("combobox").filter({ hasText: "Projekt wählen" }).click();
  await page.getByRole("option", { name: marke }).click();
  await page.getByPlaceholder("Name des Bauleiters").fill("ZZTEST Bauleiter");
  await page.getByPlaceholder("Beschreibung der ausgefuehrten Arbeiten...").fill(`${marke}: Estrich verlegt`);
  await page.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await page.waitForURL(/\/bautagesberichte\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = page.url().match(/bautagesberichte\/([0-9a-f-]{36})/)![1];
  await page.keyboard.press("Escape"); // Unterschriften-Dialog nach dem Speichern

  const [b] = await dienst<any[]>(`/rest/v1/bautagesberichte?id=eq.${id}&select=*`);
  expect(b.project_id).toBe(projektId);
  expect(b.erstellt_von).toBe(va.id);
  expect(b.ausgefuehrte_arbeiten).toBe(`${marke}: Estrich verlegt`);
  expect(b.nummer).toBeTruthy();

  // PDF wird nach dem Speichern erzeugt und in den Projektordner geladen.
  await expect.poll(async () => (await dienst<any[]>(`/rest/v1/bautagesberichte?id=eq.${id}&select=pdf_path`))[0].pdf_path,
    { timeout: 30_000 }).toBeTruthy();
  const [{ pdf_path }] = await dienst<any[]>(`/rest/v1/bautagesberichte?id=eq.${id}&select=pdf_path`);
  expect(pdf_path).toMatch(new RegExp(`^${projektId}/berichte/.+\\.pdf$`));
  const dienstKey = process.env.TEST_SERVICE_ROLE_KEY!;
  const datei = await fetch(`${API}/storage/v1/object/project-reports/${pdf_path}`, { headers: { apikey: dienstKey, Authorization: `Bearer ${dienstKey}` } });
  expect(datei.ok).toBe(true);
  const inhalt = Buffer.from(await datei.arrayBuffer());
  expect(inhalt.subarray(0, 4).toString()).toBe("%PDF");
  expect(inhalt.length).toBeGreaterThan(3000);

  await page.goto(`${APP}/bautagesberichte`);
  await expect(page.getByText(marke).first()).toBeVisible({ timeout: 20_000 });
  expect(w.abstuerze).toEqual([]);
});
