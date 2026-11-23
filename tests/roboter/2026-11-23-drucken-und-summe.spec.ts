// Drucken + Summe (23.11.2026, Rollout aus Fall Tilger/fliesentilger):
// 1) „Drucken“ öffnete das PDF im neuen Tab und rief dort print() auf – mit der Adobe-Acrobat-Erweiterung in Chrome
//    kam nur eine weiße Seite. Jetzt zeichnet die App die PDF-Seiten (pdf.js) in einen Druckbereich der Seite und druckt
//    die App-Seite (src/lib/pdfDrucken.ts): kein neuer Tab, kein iframe, mehrseitig ohne leere Zusatzseite.
// 2) Eine Zeile mit Betrag, aber ohne Beschreibung, zählte in der Summe mit, wurde beim Speichern aber verworfen
//    (Liste zeigte mehr als die Positionen). Jetzt blockiert sie das Speichern mit Hinweis (wie hw-core).
import { expect, test, type Page } from "@playwright/test";
import { APP, anmelden, dienst, konto, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

// print() abfangen und festhalten, WAS gedruckt worden wäre.
async function druckAbfangen(page: Page) {
  await page.addInitScript(() => {
    window.print = function () {
      const bereich = document.getElementById("pdf-druckbereich");
      const bilder = bereich ? Array.from(bereich.querySelectorAll("img")) : [];
      let dunklePixel = 0;
      const b = bilder[0];
      if (b && b.naturalWidth > 0) {
        const c = document.createElement("canvas");
        c.width = 400; c.height = Math.round((400 * b.naturalHeight) / b.naturalWidth);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(b, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 128 && d[i + 1] < 128 && d[i + 2] < 128) dunklePixel++;
      }
      (window as any).__druck = {
        rahmen: document.querySelectorAll("iframe[data-druckrahmen]").length,
        seiten: bilder.length,
        alleGeladen: bilder.every((x) => x.complete && x.naturalWidth > 0),
        breitePx: b?.naturalWidth ?? 0,
        dunklePixel,
      };
    };
  });
}

// Was der Browser wirklich druckt: Chromium-Druck der Seite (print-CSS, @page) → Seitenzahl.
async function gedruckteSeiten(page: Page): Promise<number> {
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

async function druckPruefen(page: Page, mindestSeiten: number) {
  await expect.poll(() => page.evaluate(() => (window as any).__druck), { timeout: 30_000 }).toBeTruthy();
  const druck = await page.evaluate(() => (window as any).__druck);
  expect(druck.seiten).toBeGreaterThanOrEqual(mindestSeiten);
  expect(druck.alleGeladen).toBe(true);
  expect(druck.breitePx).toBeGreaterThan(2000); // 300 dpi auf A4
  expect(druck.dunklePixel).toBeGreaterThan(500); // Seite ist nicht weiß
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.locator("#pdf-druckbereich img").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.emulateMedia({ media: null }); // zurücksetzen (bei „screen“ würde page.pdf() die Bildschirmansicht drucken)
  expect(await gedruckteSeiten(page)).toBe(druck.seiten); // keine leere Zusatzseite, nichts abgeschnitten
  await page.evaluate(() => { delete (window as any).__druck; });
  return druck;
}

test("Drucken: Liste und Vorschau drucken die PDF-Seiten über die App (kein PDF-Tab, mehrseitig)", async ({ page, context }) => {
  const admin = await konto("administrator");
  const kunde = `ZZTEST Druckkunde ${Date.now().toString(36)}`;
  const POS = 45; // genug für mehrere Seiten
  // Nummern über die echte Nummernvergabe der App (erfundene Laufnummern stören die fortlaufende Nummer in grund-4)
  const jahr = new Date().getFullYear();
  const nummer = async (typ: string) => {
    const n = await dienst<string>("/rest/v1/rpc/next_document_number", "POST", { p_typ: typ, p_jahr: jahr });
    return { nummer: n, laufnummer: parseInt((n.match(/(\d+)$/) || ["", "1"])[1]) || 1, jahr };
  };
  const [r] = await dienst<any[]>("/rest/v1/invoices", "POST", {
    user_id: admin.id, typ: "rechnung", status: "offen", ...(await nummer("rechnung")),
    kunde_name: kunde, netto_summe: POS * 50, mwst_satz: 20, mwst_betrag: POS * 10, brutto_summe: POS * 60,
  });
  await dienst("/rest/v1/invoice_items", "POST", Array.from({ length: POS }, (_, i) => ({
    invoice_id: r.id, position: i + 1, beschreibung: `ZZTEST Fliesen verlegen ${i + 1}`, kurztext: `ZZTEST Fliesen verlegen ${i + 1}`,
    menge: 1, einheit: "m²", einzelpreis: 50, gesamtpreis: 50,
  })));
  const [a] = await dienst<any[]>("/rest/v1/invoices", "POST", {
    user_id: admin.id, typ: "angebot", status: "entwurf", ...(await nummer("angebot")), kunde_name: `${kunde} B`,
    netto_summe: 100, mwst_satz: 20, mwst_betrag: 20, brutto_summe: 120,
  });
  await dienst("/rest/v1/invoice_items", "POST", {
    invoice_id: a.id, position: 1, beschreibung: "ZZTEST Pauschale", kurztext: "ZZTEST Pauschale",
    menge: 1, einheit: "Pauschal", einzelpreis: 100, gesamtpreis: 100,
  });

  await druckAbfangen(page);
  page.on("dialog", (d) => d.accept());
  const w = wache(page);
  const neueTabs: string[] = [];
  context.on("page", (p) => neueTabs.push(p.url()));
  await anmelden(page, admin);

  // 1) Rechnungsliste: Aktionen → „Drucken“ (mehrseitige Rechnung)
  await page.goto(`${APP}/invoices`);
  const start = Date.now();
  await page.getByRole("row").filter({ hasText: kunde }).getByTitle("Aktionen").click();
  await page.getByRole("menuitem", { name: "Drucken" }).click();
  const druck = await druckPruefen(page, 2);
  console.log(`Liste: Druck vorbereitet in ${Date.now() - start} ms, ${druck.seiten} Seiten`);

  // 2) Beleg → „Vorschau“ → „Drucken“ im offenen Vorschau-Dialog
  await page.goto(`${APP}/invoices/${a.id}`);
  await page.getByRole("button", { name: "Vorschau", exact: true }).click();
  const vorschau = page.getByRole("dialog").filter({ has: page.getByText("Dokumentvorschau") });
  const speichern = vorschau.getByRole("button", { name: "Speichern", exact: true });
  if (await speichern.isVisible({ timeout: 3000 }).catch(() => false)) await speichern.click();
  await vorschau.getByRole("button", { name: "Drucken", exact: true }).click();
  const druck2 = await druckPruefen(page, 1);
  expect(druck2.seiten).toBe(1);
  await expect(vorschau).toBeVisible(); // Dialog bleibt am Bildschirm offen

  expect(neueTabs).toEqual([]); // kein PDF-Tab mehr
  expect(w.abstuerze).toEqual([]);
});

test("Rechnung: Zeile mit Betrag ohne Beschreibung blockiert das Speichern, Summe = Positionen", async ({ page }) => {
  const admin = await konto("administrator");
  const kunde = `ZZTEST Summenkunde ${Date.now().toString(36)}`;
  await dienst("/rest/v1/customers", "POST", { user_id: admin.id, name: kunde, kundennummer: `ZZ-${Date.now().toString(36)}`, plz: "2542", ort: "Testort", adresse: "Teststraße 1", kundentyp: "privat" });
  page.on("dialog", (d) => d.accept());
  const w = wache(page);
  await anmelden(page, admin);

  await page.goto(`${APP}/invoices/new?typ=rechnung`);
  await page.getByRole("combobox").filter({ hasText: "Kunde auswählen..." }).click();
  await page.getByPlaceholder("Kunde suchen...").fill(kunde);
  await page.getByRole("option", { name: new RegExp(kunde) }).click();
  const zeilen = () => page.locator("tr").filter({ has: page.getByPlaceholder("Kurzbezeichnung") });
  await zeilen().nth(0).getByPlaceholder("Kurzbezeichnung").fill("ZZTEST Fahrtkosten");
  await zeilen().nth(0).getByPlaceholder("Kurzbezeichnung").press("Escape");
  await zeilen().nth(0).locator("input[type=number]").nth(0).fill("1");
  await zeilen().nth(0).locator("input[type=number]").nth(1).fill("100");

  // Zeile 2: 1 × 200, aber OHNE Beschreibung (Summe bleibt unter 400 € brutto – darüber verlangt die App die eigene UID)
  await page.getByRole("button", { name: "Position", exact: true }).click();
  await expect(zeilen()).toHaveCount(2);
  await zeilen().nth(1).locator("input[type=number]").nth(0).fill("1");
  await zeilen().nth(1).locator("input[type=number]").nth(1).fill("200");
  await zeilen().nth(1).locator("input[type=number]").nth(1).blur();

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Position ohne Beschreibung").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Position 2 hat einen Betrag/).first()).toBeVisible();
  expect(await dienst<any[]>(`/rest/v1/invoices?kunde_name=eq.${encodeURIComponent(kunde)}&select=id`)).toHaveLength(0);

  // Beschreibung nachtragen → speichern geht, gespeicherte Summe = Summe der Positionen
  await zeilen().nth(1).getByPlaceholder("Kurzbezeichnung").fill("ZZTEST Pauschale");
  await zeilen().nth(1).getByPlaceholder("Kurzbezeichnung").press("Escape");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = page.url().match(/invoices\/([0-9a-f-]{36})/)![1];
  const [r] = await dienst<any[]>(`/rest/v1/invoices?id=eq.${id}&select=netto_summe,brutto_summe`);
  const pos = await dienst<any[]>(`/rest/v1/invoice_items?invoice_id=eq.${id}&select=beschreibung,gesamtpreis&order=position`);
  expect(pos.map((p) => p.beschreibung)).toEqual(["ZZTEST Fahrtkosten", "ZZTEST Pauschale"]);
  expect(Number(r.netto_summe)).toBeCloseTo(pos.reduce((s, p) => s + Number(p.gesamtpreis), 0), 2);
  expect(Number(r.netto_summe)).toBeCloseTo(300, 2);
  expect(Number(r.brutto_summe)).toBeCloseTo(360, 2);
  expect(w.abstuerze).toEqual([]);
});
