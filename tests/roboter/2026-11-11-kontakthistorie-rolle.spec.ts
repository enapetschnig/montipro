// Probefahrt 11.11.2026 (Christoph, Nachtschicht: „column profiles.role does not exist“, 4× im Datenbank-Log):
// Die Kontakthistorie (Kunde/Projekt) fragte die Rolle bei profiles.role ab – die Spalte gibt es nicht.
// Jetzt aus user_roles: Admin sieht „Löschen“ auch bei fremden Einträgen, Vorarbeiter nur bei eigenen,
// und keine abgelehnte Abfrage mehr. Läuft NUR gegen die Testumgebung (siehe grundtest-hilfe.ts).
import { expect, test } from "@playwright/test";
import { anmelden, APP, dienst, konto, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

for (const rolle of ["administrator", "vorarbeiter"] as const) {
  test(`${rolle}: Kontakthistorie ohne Fehl-Abfrage, Löschen nur wo erlaubt`, async ({ page }) => {
    const k = await konto(rolle);
    const { projektId } = await testProjekt(`Kontakt ${rolle}`, [k]);
    // Eintrag eines anderen (erstellt_von leer) – nur der Admin darf ihn löschen
    await dienst("/rest/v1/contact_history", "POST", { project_id: projektId, typ: "notiz", betreff: "ZZTEST fremder Eintrag" });

    const w = wache(page);
    await anmelden(page, k);
    await page.goto(`${APP}/projects/${projektId}`); // Projektübersicht zeigt die Kontakthistorie (Kunden-Seite nur Admin)
    await expect(page.getByText("ZZTEST fremder Eintrag")).toBeVisible();
    await page.waitForTimeout(1000); // Rollenabfrage abwarten
    const loeschen = page.getByRole("button", { name: "Löschen" });
    if (rolle === "administrator") await expect(loeschen).toHaveCount(1);
    else await expect(loeschen).toHaveCount(0);

    expect(w.abstuerze).toEqual([]);
    expect(w.abgelehnt.filter((a) => a.includes("/profiles") || a.includes("/user_roles") || a.includes("/contact_history"))).toEqual([]);
  });
}
