// Grundablauf Stunden erfassen (09.11.2026): Mitarbeiter bucht heute auf ein Projekt, die Buchung steht richtig in
// der Datenbank und unter „Meine Stunden“ (gespeichert wird über die Edge Function create-team-time-entries –
// die Testumgebung braucht dafür `supabase functions serve`, siehe grundtest-hilfe.ts); eine überschneidende zweite Buchung wird abgelehnt (keine Doppelbuchung).
import { expect, test } from "@playwright/test";
import { APP, anmelden, dienst, functionLaeuft, konto, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Mitarbeiter: Stunden auf Projekt buchen, in Meine Stunden sehen, keine Überschneidung", async ({ page }) => {
  expect(await functionLaeuft("create-team-time-entries"), "Edge Functions nicht gestartet – siehe grundtest-hilfe.ts").toBe(true);
  const ma = await konto("mitarbeiter");
  const { projektId, marke } = await testProjekt("Stunden", [ma]);
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
  await dienst(`/rest/v1/time_entries?user_id=eq.${ma.id}&datum=eq.${heute}`, "DELETE"); // Reste früherer Läufe
  const w = wache(page);
  await anmelden(page, ma);

  const buchen = async () => {
    await page.goto(`${APP}/time-tracking`);
    await page.getByRole("combobox").filter({ hasText: "Projekt auswählen" }).click();
    await page.getByRole("option", { name: new RegExp(marke) }).click();
    await page.getByPlaceholder("z.B. Montage, Aufmaß...").fill(`${marke} Montage`);
    await page.locator("label:has-text('Beginn') + button").click();
    await page.getByRole("option", { name: "07:00", exact: true }).click();
    await page.locator("label:has-text('Ende') + button").click();
    await page.getByRole("option", { name: "11:30", exact: true }).click();
    await page.getByRole("button", { name: "30 Min", exact: true }).click();
    await expect(page.getByText("Gesamt zu buchen").locator("..")).toContainText("4.00 h");
    await page.getByRole("button", { name: "Stunden erfassen" }).click();
  };

  await buchen();
  await expect(page.getByText("Eintrag/Einträge gespeichert").first()).toBeVisible({ timeout: 20_000 });
  const eintraege = await dienst<any[]>(`/rest/v1/time_entries?user_id=eq.${ma.id}&datum=eq.${heute}&select=*`);
  expect(eintraege).toHaveLength(1);
  expect(eintraege[0].project_id).toBe(projektId);
  expect(Number(eintraege[0].stunden)).toBe(4);
  expect(eintraege[0].start_time.slice(0, 5)).toBe("07:00");
  expect(eintraege[0].end_time.slice(0, 5)).toBe("11:30");
  expect(eintraege[0].pause_minutes).toBe(30);

  await page.goto(`${APP}/my-hours`);
  const zeile = page.getByRole("row").filter({ hasText: marke });
  await expect(zeile).toHaveCount(1, { timeout: 20_000 });
  for (const teil of ["07:00", "11:30", "30 Min", "4.00 h"]) await expect(zeile).toContainText(teil);

  // Gleiche Zeit nochmal buchen → abgelehnt, es bleibt bei einem Eintrag.
  await buchen();
  await expect(page.getByText("Zeitüberschneidung").first()).toBeVisible();
  expect(await dienst<any[]>(`/rest/v1/time_entries?user_id=eq.${ma.id}&datum=eq.${heute}&select=id`)).toHaveLength(1);
  expect(w.abstuerze).toEqual([]);
});

test("Mitarbeiter sieht in der Zeiterfassung nur zugewiesene Projekte (Admin weist zu)", async ({ page }) => {
  const ma = await konto("mitarbeiter");
  const zugewiesen = await testProjekt("Zugewiesen", [ma]);
  const fremd = await testProjekt("Nicht zugewiesen");
  await anmelden(page, ma);
  await page.goto(`${APP}/time-tracking`);
  await page.getByRole("combobox").filter({ hasText: "Projekt auswählen" }).click();
  await expect(page.getByRole("option", { name: new RegExp(zugewiesen.marke) })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(fremd.marke) })).toHaveCount(0);
});
