// Regressionstests für die Stundenrechnung.
//
// Diese Logik ist zweimal still kaputtgegangen (Zeitausgleich wurde doppelt
// abgezogen; das Monats-Soll schrumpfte um jeden Abwesenheits- und jeden
// nicht erfassten Tag). Die Tests halten das Modell fest:
//
//   Soll   = alle Mo-Do × 10 h (Feiertage eingeschlossen), laufender Monat
//            nur bis heute
//   Ist    = alle gebuchten Stunden
//   Saldo  = Ist − Soll, wobei Abwesenheiten/Feiertage neutral sind und
//            Werktage ohne jede Erfassung als Minus zählen
//   ZA     = im Auto-Saldo neutral (Abzug läuft einmalig übers Zeitkonto)

import { describe, it, expect } from "vitest";
import { aggregateByDay, aggregateMonth, totalAutoSaldo, formatSaldo } from "./hoursAccounting";

const e = (datum: string, stunden: number, taetigkeit?: string) => ({ datum, stunden, taetigkeit });

describe("aggregateByDay", () => {
  it("normaler Mo-Do-Tag: Saldo = Ist − 10", () => {
    const [d] = aggregateByDay([e("2026-07-14", 12)]); // Dienstag
    expect(d.soll).toBe(10);
    expect(d.saldo).toBe(2);
  });

  it("Freitag zählt voll als Plus (Soll 0)", () => {
    const [d] = aggregateByDay([e("2026-07-03", 9.5)]); // Freitag
    expect(d.soll).toBe(0);
    expect(d.saldo).toBe(9.5);
  });

  it("Zeitausgleich ist im Auto-Saldo neutral, behält aber das Tagessoll", () => {
    const [d] = aggregateByDay([e("2026-07-13", 10, "Zeitausgleich")]); // Montag
    expect(d.soll).toBe(10);   // darf NICHT 0 sein, sonst schrumpft das Monats-Soll
    expect(d.saldo).toBe(0);   // darf NICHT -10 sein, sonst Doppelzählung mit dem Zeitkonto
  });

  it("Urlaub/Krankenstand sind neutral", () => {
    for (const t of ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag"]) {
      const [d] = aggregateByDay([e("2026-07-14", 10, t)]);
      expect(d.saldo, t).toBe(0);
      expect(d.soll, t).toBe(10);
    }
  });

  it("Feiertag behält das Tagessoll, auch mit holidaySet", () => {
    const [d] = aggregateByDay([e("2026-06-04", 10, "Feiertag")], new Set(["2026-06-04"]));
    expect(d.soll).toBe(10);
    expect(d.saldo).toBe(0);
  });

  it("mehrere Einträge am selben Tag werden zusammengezählt", () => {
    const [d] = aggregateByDay([e("2026-07-06", 5.5), e("2026-07-06", 7.5)]);
    expect(d.ist).toBe(13);
    expect(d.saldo).toBe(3);
  });
});

describe("aggregateMonth — abgeschlossener Monat", () => {
  const heute = new Date(2026, 6, 21); // 21.07.2026, damit Juni abgeschlossen ist
  const feiertage = new Set(["2026-06-04"]); // Fronleichnam (Do)

  it("Soll = alle Mo-Do des Monats inkl. Feiertag (Juni 2026 = 180 h)", () => {
    const mb = aggregateMonth([], 2026, 6, feiertage, heute);
    expect(mb.soll).toBe(180);
    expect(mb.bisHeute).toBe(false);
  });

  it("Werktag ohne Eintrag ergibt Minus und wird gemeldet", () => {
    const mb = aggregateMonth([e("2026-06-01", 10)], 2026, 6, feiertage, heute);
    expect(mb.ist).toBe(10);
    expect(mb.soll).toBe(180);
    // 17 nicht erfasste Werktage (18 Mo-Do minus 1 erfasster), Feiertag zählt nicht als fehlend
    expect(mb.fehlendeWerktage).toHaveLength(16);
    expect(mb.fehlendeWerktage).not.toContain("2026-06-04");
  });

  it("Feiertag ohne Buchung gilt als erfüllt (kein Minus)", () => {
    const mb = aggregateMonth([], 2026, 6, feiertage, heute);
    expect(mb.fehlendeWerktage).not.toContain("2026-06-04");
  });

  it("Ist − Soll = Saldo (realer Fall Juni 2026)", () => {
    // Nachbau des Live-Falls: 16 gearbeitete Mo-Do-Tage, 1 Feiertag, 1 ZA,
    // Freitagsarbeit, 1 nicht erfasster Werktag.
    const entries = [
      e("2026-06-01", 10), e("2026-06-02", 10), e("2026-06-03", 10),
      e("2026-06-04", 10, "Feiertag"),
      e("2026-06-05", 8),                      // Freitag → +8
      e("2026-06-08", 10), e("2026-06-09", 10), e("2026-06-10", 10), e("2026-06-11", 10),
      // 15.06. fehlt bewusst
      e("2026-06-16", 10), e("2026-06-17", 10), e("2026-06-18", 10),
      e("2026-06-22", 10, "Zeitausgleich"),
      e("2026-06-23", 10), e("2026-06-24", 10), e("2026-06-25", 10),
      e("2026-06-29", 10), e("2026-06-30", 10),
    ];
    const mb = aggregateMonth(entries, 2026, 6, feiertage, heute);
    expect(mb.soll).toBe(180);
    expect(mb.fehlendeWerktage).toEqual(["2026-06-15"]);
    // Ist 178, Soll 180 → -2: +8 Freitag, -10 fehlender Tag, Rest neutral
    expect(mb.ist).toBe(178);
    expect(mb.saldo).toBe(-2);
  });

  it("Wochenend-/Freitagsarbeit zählt voll als Plus", () => {
    const mb = aggregateMonth([e("2026-06-06", 6)], 2026, 6, feiertage, heute); // Samstag
    expect(mb.soll).toBe(180);
    // 18 Mo-Do minus Fronleichnam (gilt als erfüllt) = 17 fehlende Werktage
    expect(mb.fehlendeWerktage).toHaveLength(17);
    expect(mb.saldo).toBe(-170 + 6);
  });
});

describe("aggregateMonth — laufender Monat", () => {
  const heute = new Date(2026, 6, 21); // 21.07.2026

  it("Soll wird auf gestern gekappt (heutiger Arbeitstag läuft noch)", () => {
    const mb = aggregateMonth([], 2026, 7, undefined, heute);
    // Mo-Do bis einschließlich 20.07.: 1,2,6,7,8,9,13,14,15,16,20 = 11 Tage
    expect(mb.soll).toBe(110);
    expect(mb.bisHeute).toBe(true);
  });

  it("zukünftige Tage des laufenden Monats erzeugen kein Minus", () => {
    const mb = aggregateMonth([], 2026, 7, undefined, heute);
    expect(mb.fehlendeWerktage).not.toContain("2026-07-22");
    expect(mb.fehlendeWerktage).not.toContain("2026-07-30");
  });

  it("am Monatsersten gibt es noch kein Soll (nur der laufende Tag)", () => {
    const mb = aggregateMonth([], 2026, 7, undefined, new Date(2026, 6, 1));
    expect(mb.soll).toBe(0);
    expect(mb.saldo).toBe(0);
    expect(mb.fehlendeWerktage).toEqual([]);
  });

  it("vergangener Monat wird nicht gekappt", () => {
    const mb = aggregateMonth([], 2026, 5, undefined, heute);
    expect(mb.bisHeute).toBe(false);
  });
});

describe("aggregateMonth — Edge-Cases aus dem Audit", () => {
  const heute = new Date(2026, 6, 21); // Di, 21.07.2026

  it("Zukunftsmonat erzeugt KEIN Soll und kein Minus", () => {
    const mb = aggregateMonth([], 2026, 8, undefined, heute);
    expect(mb.soll).toBe(0);
    expect(mb.saldo).toBe(0);
    expect(mb.fehlendeWerktage).toEqual([]);
    expect(mb.zukunft).toBe(true);
  });

  it("der heutige Tag zählt noch nicht als fehlend (Arbeitstag läuft)", () => {
    const mb = aggregateMonth([], 2026, 7, undefined, heute);
    expect(mb.fehlendeWerktage).not.toContain("2026-07-21");
    // Mo-Do bis einschließlich 20.07.: 1,2,6,7,8,9,13,14,15,16,20 = 11 Tage
    expect(mb.soll).toBe(110);
  });

  it("vorab gebuchter Urlaub in der Zukunft verfälscht das Ist nicht", () => {
    const entries = [
      e("2026-07-20", 10),                       // gestern gearbeitet
      e("2026-07-27", 10, "Urlaub"),             // nächste Woche vorgebucht
      e("2026-07-28", 10, "Urlaub"),
    ];
    const mb = aggregateMonth(entries, 2026, 7, undefined, heute);
    expect(mb.ist).toBe(10);                     // nur bis gestern
    expect(mb.soll).toBe(110);
    expect(mb.saldo).toBe(10 - 110);
  });

  it("nach dem Austritt entsteht kein Soll und kein Minus", () => {
    // Ausgeschieden am 08.05.2026 → Juni darf nichts mehr zeigen
    const mb = aggregateMonth([], 2026, 6, undefined, heute, { austritt: "2026-05-08" });
    expect(mb.soll).toBe(0);
    expect(mb.saldo).toBe(0);
    expect(mb.fehlendeWerktage).toEqual([]);
  });

  it("vor dem Eintritt entsteht kein Soll", () => {
    // Eintritt 15.06.2026 → nur Werktage ab dem 15. zählen
    const mb = aggregateMonth([], 2026, 6, undefined, heute, { eintritt: "2026-06-15" });
    // Mo-Do ab 15.06.: 15,16,17,18,22,23,24,25,29,30 = 10 Tage
    expect(mb.soll).toBe(100);
    expect(mb.fehlendeWerktage).not.toContain("2026-06-01");
  });

  it("ungültiger Monat liefert Nullwerte statt NaN", () => {
    const mb = aggregateMonth([], NaN as any, undefined as any, undefined, heute);
    expect(mb.soll).toBe(0);
    expect(mb.saldo).toBe(0);
    expect(Number.isNaN(mb.ist)).toBe(false);
  });
});

describe("Misch- und Teil-Abwesenheitstage", () => {
  it("halber Urlaubstag ohne Arbeit erzeugt KEIN Minus", () => {
    const [d] = aggregateByDay([e("2026-07-14", 5, "Urlaub")]);
    expect(d.soll).toBe(10);
    expect(d.saldo).toBe(0);
  });

  it("Abwesenheit plus zusätzlich gearbeitete Stunden zählt die Mehrstunden", () => {
    const [d] = aggregateByDay([e("2026-07-14", 10, "Urlaub"), e("2026-07-14", 4)]);
    expect(d.ist).toBe(14);
    expect(d.saldo).toBe(4);
  });

  it("Arbeit am Feiertag über das Tagessoll hinaus zählt als Plus", () => {
    const [d] = aggregateByDay([e("2026-06-04", 12)], new Set(["2026-06-04"]));
    expect(d.saldo).toBe(2);
  });

  it("Tätigkeit mit Leerzeichen wird trotzdem als Abwesenheit erkannt", () => {
    const [d] = aggregateByDay([e("2026-07-14", 10, " Zeitausgleich ")]);
    expect(d.saldo).toBe(0);
  });
});

describe("Zeitausgleich zählt genau einmal", () => {
  it("ein ZA-Tag verändert den Auto-Saldo nicht (Abzug läuft übers Zeitkonto)", () => {
    const ohneZA = totalAutoSaldo([e("2026-07-14", 10)]);
    const mitZA = totalAutoSaldo([e("2026-07-14", 10), e("2026-07-13", 10, "Zeitausgleich")]);
    expect(mitZA).toBe(ohneZA);
  });
});

describe("formatSaldo", () => {
  it("zeigt Vorzeichen", () => {
    expect(formatSaldo(2.5)).toBe("+2.50");
    expect(formatSaldo(-2.5)).toBe("-2.50");
    expect(formatSaldo(0)).toBe("±0.00");
  });
});
