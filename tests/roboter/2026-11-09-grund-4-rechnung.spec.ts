// Grundablauf Rechnung (09.11.2026, rechnungen-belege.md): Admin legt eine Rechnung für einen Kunden an, speichert,
// Status „offen“ statt Entwurf, Beträge stimmen (20 % MwSt), Nummern laufen fortlaufend weiter, PDF lässt sich öffnen.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { APP, anmelden, dienst, konto, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

async function rechnungAnlegen(page: Page, kunde: string, text: string, preis: string) {
  await page.goto(`${APP}/invoices/new?typ=rechnung`);
  await page.getByRole("combobox").filter({ hasText: "Kunde auswählen..." }).click();
  await page.getByPlaceholder("Kunde suchen...").fill(kunde);
  await page.getByRole("option", { name: new RegExp(kunde) }).click();
  const zeile = page.locator("tr").filter({ has: page.getByPlaceholder("Kurzbezeichnung") }).first();
  await zeile.getByPlaceholder("Kurzbezeichnung").fill(text);
  const zahlen = zeile.locator("input[type=number]");
  await zahlen.nth(0).fill("2"); // Menge
  await zahlen.nth(1).fill(preis); // Einzelpreis netto
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });
  return page.url().match(/invoices\/([0-9a-f-]{36})/)![1];
}

async function pdfLaden(page: Page) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: /^PDF( herunterladen)?$/ }).first().click(),
  ]);
  const inhalt = fs.readFileSync((await dl.path())!);
  return { name: dl.suggestedFilename(), inhalt };
}

test("Administrator: Rechnung anlegen, speichern, fortlaufende Nummer, PDF", async ({ page }) => {
  const admin = await konto("administrator");
  const marke = `ZZTEST Kunde ${Date.now().toString(36)}`;
  await dienst("/rest/v1/customers", "POST", { user_id: admin.id, name: marke, kundennummer: `ZZ-${Date.now().toString(36)}`, plz: "2542", ort: "Testort", adresse: "Teststraße 1", kundentyp: "privat" });
  const w = wache(page);
  await anmelden(page, admin);

  const id1 = await rechnungAnlegen(page, marke, "ZZTEST Fliesen verlegen", "150");
  await expect(page.getByText("Gespeichert").first()).toBeVisible();
  const [r1] = await dienst<any[]>(`/rest/v1/invoices?id=eq.${id1}&select=*`);
  expect(r1.typ).toBe("rechnung");
  expect(r1.kunde_name).toBe(marke);
  expect(r1.status).toBe("offen");
  expect(Number(r1.netto_summe)).toBeCloseTo(300, 2);
  expect(Number(r1.mwst_betrag)).toBeCloseTo(60, 2);
  expect(Number(r1.brutto_summe)).toBeCloseTo(360, 2);
  expect(r1.nummer).toBeTruthy();
  const pos = await dienst<any[]>(`/rest/v1/invoice_items?invoice_id=eq.${id1}&select=beschreibung,menge,einzelpreis`);
  expect(pos).toHaveLength(1);
  expect(pos[0].beschreibung).toBe("ZZTEST Fliesen verlegen");

  const pdf = await pdfLaden(page);
  expect(pdf.name).toContain(r1.nummer);
  expect(pdf.inhalt.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.inhalt.length).toBeGreaterThan(5000);

  // Zweite Rechnung bekommt die nächste Nummer – fortlaufend, nie zurück.
  const id2 = await rechnungAnlegen(page, marke, "ZZTEST Silikonfugen", "40");
  const [r2] = await dienst<any[]>(`/rest/v1/invoices?id=eq.${id2}&select=nummer,laufnummer,jahr`);
  expect(r2.nummer).not.toBe(r1.nummer);
  expect(r2.laufnummer).toBe(r1.laufnummer + 1);

  // In der Belegliste auffindbar.
  await page.goto(`${APP}/invoices`);
  await expect(page.getByText(r1.nummer).first()).toBeVisible({ timeout: 20_000 });
  expect(w.abstuerze).toEqual([]);
});

test("Echte Rechnung aus den anonymisierten Daten öffnet und liefert ein PDF", async ({ page }) => {
  const [rechnung] = await dienst<{ id: string; nummer: string }[]>(
    "/rest/v1/invoices?typ=eq.rechnung&kunde_name=not.like.ZZTEST*&order=created_at.desc&limit=1&select=id,nummer");
  test.skip(!rechnung, "keine Echtdaten geladen (testumgebung.mjs daten)");
  const w = wache(page);
  await anmelden(page, await konto("administrator"));
  await page.goto(`${APP}/invoices/${rechnung.id}`);
  const pdf = await pdfLaden(page);
  expect(pdf.name).toContain(rechnung.nummer);
  expect(pdf.inhalt.subarray(0, 4).toString()).toBe("%PDF");
  expect(w.abstuerze).toEqual([]);
});
