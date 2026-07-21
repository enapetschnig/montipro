// Zentrale Saldo-Logik für Stundenauswertung.
//
// Kernregel: Überstunden und Minusstunden werden PRO TAG gerechnet,
// nicht pro time_entry. Bei mehreren Projekten am selben Tag würde
// eine per-Entry-Berechnung Math.max(0, 6h - 10h) = 0 zweimal liefern,
// obwohl der Tag in Summe 12h und damit +2h Überstunden hat.
//
// Sonderzeiten (Urlaub / Krankenstand / Feiertag / Zeitausgleich /
// Weiterbildung): Tagessoll wird auf 0 gesetzt UND die Stunden werden
// nicht als Überstunden gewertet. Saldo neutral pro solchem Tag.

import { getNormalWorkingHours } from "@/lib/workingHours";

export type TimeEntryLite = {
  datum: string;
  stunden: number | string | null;
  taetigkeit?: string | null;
};

export type DayBalance = {
  datum: string;          // YYYY-MM-DD
  ist: number;            // gebuchte Summe (alle Einträge des Tages)
  soll: number;           // Tagessoll (10/0 Mo-Do/sonst, 0 bei Sonderzeit)
  saldo: number;          // ist - soll, kann negativ sein
  istSonderzeit: boolean;
};

/**
 * Tätigkeiten, die das Tagessoll als erfüllt markieren — der Tag
 * wird neutral (Saldo 0) gerechnet, egal wie viele Stunden gebucht
 * sind.
 */
export const SONDER_TAETIGKEITEN = new Set([
  "Urlaub",
  "Krankenstand",
  "Feiertag",
  "Weiterbildung",
  // Zeitausgleich zählt hier als NEUTRAL (Saldo 0). Der eigentliche Abzug
  // passiert genau EINMAL über das Zeitkonto (time_accounts.balance_hours =
  // "Manuell"). Früher wurde der ZA-Tag zusätzlich mit saldo=-ist im "Auto"-
  // Saldo verrechnet → 10h ZA senkten den Effektiv-Saldo um 20h statt 10h
  // (Doppelzählung, User-Feedback 06.07.2026). Der Effektiv-Saldo
  // (Auto + Manuell) sinkt weiterhin um genau die ZA-Stunden.
  "Zeitausgleich",
]);

export const ZEITAUSGLEICH_TAETIGKEIT = "Zeitausgleich";

/**
 * Tätigkeiten, bei denen die Ort-Spalte in HoursReport/MyHours leer
 * sein soll. Umfasst SONDER_TAETIGKEITEN + Zeitausgleich — denn auch
 * an einem ZA-Tag ist "Baustelle" als Ort irreführend.
 */
export function ortAnzeigeAusblenden(taetigkeit: string | null | undefined): boolean {
  if (!taetigkeit) return false;
  return SONDER_TAETIGKEITEN.has(taetigkeit) || taetigkeit === ZEITAUSGLEICH_TAETIGKEIT;
}

/**
 * Aggregiert beliebige time_entries nach Datum und liefert je Tag
 * Ist-, Soll- und Saldo-Stunden. Sortiert aufsteigend nach Datum.
 */
export function aggregateByDay(entries: TimeEntryLite[], holidaySet?: Set<string>): DayBalance[] {
  const grouped = new Map<string, TimeEntryLite[]>();
  for (const e of entries) {
    if (!e?.datum) continue;
    const list = grouped.get(e.datum) || [];
    list.push(e);
    grouped.set(e.datum, list);
  }
  const out: DayBalance[] = [];
  for (const [datum, dayEntries] of grouped) {
    const ist = dayEntries.reduce((s, e) => s + Number(e.stunden || 0), 0);
    const istSonderzeit = dayEntries.some(
      (e) => !!e.taetigkeit && SONDER_TAETIGKEITEN.has(e.taetigkeit),
    );
    const isHoliday = holidaySet?.has(datum) === true;

    // Zwei Fälle:
    //   1) Sonderzeit (Urlaub, Krankenstand, Feiertag, Weiterbildung,
    //      Zeitausgleich) oder AT-Feiertag: Soll=0, Saldo=0 (neutral).
    //      ZA wird separat über das Zeitkonto (Manuell) abgezogen — hier
    //      neutral, um Doppelzählung zu vermeiden.
    //   2) Normaler Arbeitstag: Soll = Wochentag-Regel, Saldo = ist - soll.
    let soll: number;
    let saldo: number;
    if (istSonderzeit || isHoliday) {
      // Das Tagessoll bleibt bestehen (der Tag WAR ein Arbeitstag) — es gilt
      // durch die Abwesenheit bzw. den Feiertag als erfüllt, daher Saldo 0.
      // Bewusst OHNE holidaySet gerechnet: auch ein Feiertag zählt mit seinen
      // 10 h ins Monats-Soll und wird durch die Feiertags-Buchung neutralisiert.
      // Früher wurde soll=0 gesetzt — dadurch schrumpfte das Monats-Soll um
      // jeden Abwesenheitstag (Juni 2026: 160 statt 180 h, Feedback 21.07.2026).
      soll = getNormalWorkingHours(new Date(datum + "T12:00:00"));
      saldo = 0;
    } else {
      soll = getNormalWorkingHours(new Date(datum + "T12:00:00"), holidaySet);
      saldo = ist - soll;
    }

    out.push({
      datum, ist, soll, saldo,
      istSonderzeit: istSonderzeit || isHoliday,
    });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

export type MonthBalance = {
  /** Summe aller gebuchten Stunden im Monat (inkl. Abwesenheiten). */
  ist: number;
  /** Monats-Soll aus dem KALENDER (alle Mo-Do ohne Feiertage), nicht aus den Einträgen. */
  soll: number;
  /** ist − soll, wobei Abwesenheitstage neutral sind und fehlende Werktage als Minus zählen. */
  saldo: number;
  /** Werktage im Zeitraum ohne jeden Eintrag (fehlende Zeiterfassung). */
  fehlendeWerktage: string[];
  /** true = laufender Monat, Soll nur bis heute gerechnet. */
  bisHeute: boolean;
};

/**
 * Monats-Auswertung mit KALENDER-basiertem Soll.
 *
 * Wichtig: Das Soll wird über alle Werktage des Monats gerechnet — nicht nur
 * über Tage, an denen Einträge existieren. Vorher schrumpfte das Soll um
 * jeden Abwesenheits- und jeden nicht erfassten Tag (Juni 2026: 160 statt
 * 180 h). Ein Werktag ganz ohne Eintrag erzeugt jetzt sichtbar ein Minus.
 *
 * Im LAUFENDEN Monat wird nur bis heute gerechnet, sonst würden die noch
 * nicht gearbeiteten Resttage als riesiges Minus erscheinen.
 */
export function aggregateMonth(
  entries: TimeEntryLite[],
  year: number,
  month: number,          // 1-12
  holidaySet?: Set<string>,
  today: Date = new Date(),
): MonthBalance {
  const lastDay = new Date(year, month, 0).getDate();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const endDay = isCurrentMonth ? Math.min(today.getDate(), lastDay) : lastDay;

  const byDay = new Map(aggregateByDay(entries, holidaySet).map(d => [d.datum, d]));
  const ist = entries.reduce((s, e) => s + Number(e?.stunden || 0), 0);

  let soll = 0;
  let saldo = 0;
  const fehlendeWerktage: string[] = [];

  for (let day = 1; day <= endDay; day++) {
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const datum = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Soll bewusst OHNE holidaySet: ein Feiertag Mo-Do zählt mit 10 h ins
    // Monats-Soll (Juni 2026 = 18 Werktage = 180 h) und wird unten neutralisiert.
    const tagesSoll = getNormalWorkingHours(dateObj);
    const istFeiertag = holidaySet?.has(datum) === true;
    soll += tagesSoll;              // 0 an Fr/Sa/So

    const bal = byDay.get(datum);
    if (bal) {
      // Auch an arbeitsfreien Tagen zählen: Freitags-/Wochenendarbeit hat
      // Soll 0 und damit den vollen Ist-Wert als Plus.
      saldo += bal.saldo;           // Abwesenheit/Feiertag = 0, sonst ist − soll
    } else if (tagesSoll > 0 && !istFeiertag) {
      saldo -= tagesSoll;           // Werktag ganz ohne Erfassung
      fehlendeWerktage.push(datum);
    }
    // Feiertag ohne Buchung: Soll gezählt, Saldo neutral (gilt als erfüllt).
  }

  return { ist, soll, saldo, fehlendeWerktage, bisHeute: isCurrentMonth };
}

/** Saldo-Summe über die gegebenen Einträge — Auto-Saldo aus time_entries. */
export function totalAutoSaldo(entries: TimeEntryLite[], holidaySet?: Set<string>): number {
  return aggregateByDay(entries, holidaySet).reduce((s, d) => s + d.saldo, 0);
}

/**
 * Formatierter Saldo mit Vorzeichen (für UI und Excel-Export).
 * +0,00 bei genau 0 — leer string nur explizit angefordert.
 */
export function formatSaldo(value: number, opts?: { hideZero?: boolean }): string {
  if (opts?.hideZero && Math.abs(value) < 0.005) return "";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}
