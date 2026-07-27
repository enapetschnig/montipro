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
  // trim(): taetigkeit ist an mehreren Stellen ein freies Textfeld —
  // " Zeitausgleich " muss genauso erkannt werden wie "Zeitausgleich".
  const t = taetigkeit.trim();
  return SONDER_TAETIGKEITEN.has(t) || t === ZEITAUSGLEICH_TAETIGKEIT;
}

/** Zentraler ZA-Check — trim-sicher, für alle Anzeige-Stellen. */
export function istZeitausgleich(taetigkeit: string | null | undefined): boolean {
  return (taetigkeit ?? "").trim() === ZEITAUSGLEICH_TAETIGKEIT;
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
    // trim(), weil taetigkeit an mehreren Stellen ein freies Textfeld ist und
    // Leerzeichen sonst zu "kein Sonderzeit-Tag" führen würden.
    const istSonderzeit = dayEntries.some(
      (e) => !!e.taetigkeit && SONDER_TAETIGKEITEN.has(e.taetigkeit.trim()),
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
      // durch die Abwesenheit bzw. den Feiertag als erfüllt, daher kein Minus.
      // Bewusst OHNE holidaySet gerechnet: auch ein Feiertag zählt mit seinen
      // 10 h ins Monats-Soll und wird durch die Feiertags-Buchung neutralisiert.
      // Früher wurde soll=0 gesetzt — dadurch schrumpfte das Monats-Soll um
      // jeden Abwesenheitstag (Juni 2026: 160 statt 180 h, Feedback 21.07.2026).
      //
      // ABWESENHEITS-Stunden zählen höchstens bis zum Tagessoll — sie können
      // das Soll erfüllen, aber nie ein Plus erzeugen (sonst brächte z.B. ein
      // Zeitausgleich am arbeitsfreien Freitag +10 in den Auto-Saldo, während
      // dieselben 10 h vom Zeitkonto abgebucht werden = Gratis-Stunden).
      // Echte ARBEITS-Stunden am selben Tag (Mischtag, Arbeit am Feiertag)
      // zählen dagegen voll — was über das Soll hinausgeht, ist Plus.
      // Ein Minus kann nie entstehen: die Abwesenheit deckt das Soll ab.
      const sonderIst = dayEntries.reduce((s, e) =>
        (!!e.taetigkeit && SONDER_TAETIGKEITEN.has(e.taetigkeit.trim()))
          ? s + Number(e.stunden || 0) : s, 0);
      const arbeitIst = ist - sonderIst;
      soll = getNormalWorkingHours(new Date(datum + "T12:00:00"));
      saldo = Math.max(0, Math.min(sonderIst, soll) + arbeitIst - soll);
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
  /** true = laufender Monat, Soll nur bis gestern gerechnet. */
  bisHeute: boolean;
  /** true = Monat liegt komplett in der Zukunft (Soll 0, kein Minus). */
  zukunft: boolean;
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
  /** Beschäftigungszeitraum (YYYY-MM-DD). Tage davor/danach zählen nicht. */
  beschaeftigung?: { eintritt?: string | null; austritt?: string | null },
): MonthBalance {
  // Ungültige Eingaben (leeres Monatsfeld → NaN) sicher abfangen, sonst
  // laufen alle Folgerechnungen auf NaN.
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ist: 0, soll: 0, saldo: 0, fehlendeWerktage: [], bisHeute: false, zukunft: false };
  }

  const lastDay = new Date(year, month, 0).getDate();
  // Monats-Ordinalzahl statt reiner Gleichheitsprüfung — unterscheidet
  // Vergangenheit / laufend / Zukunft. Ein Monat, der noch nicht begonnen hat,
  // darf KEIN Soll erzeugen (sonst z.B. August im Juli mit Saldo −170 h).
  const monthOrd = year * 12 + (month - 1);
  const todayOrd = today.getFullYear() * 12 + today.getMonth();
  const isCurrentMonth = monthOrd === todayOrd;
  const isFutureMonth = monthOrd > todayOrd;
  // Der HEUTIGE Tag wird noch nicht gewertet — der Arbeitstag läuft ja noch.
  // Sonst stünde den ganzen Tag über ein "-10 h / 1 Werktag ohne Erfassung".
  const endDay = isFutureMonth ? 0 : isCurrentMonth ? Math.min(today.getDate() - 1, lastDay) : lastDay;

  const byDay = new Map(aggregateByDay(entries, holidaySet).map(d => [d.datum, d]));

  let ist = 0;
  let soll = 0;
  let saldo = 0;
  const fehlendeWerktage: string[] = [];

  for (let day = 1; day <= endDay; day++) {
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const datum = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Soll bewusst OHNE holidaySet: ein Feiertag Mo-Do zählt mit 10 h ins
    // Monats-Soll (Juni 2026 = 18 Werktage = 180 h) und wird unten neutralisiert.
    // Außerhalb des Beschäftigungsverhältnisses gibt es weder Soll noch
    // fehlende Tage — sonst zeigt ein ausgeschiedener Mitarbeiter für jeden
    // Folgemonat ein Minus (z.B. -160 h im Monat nach dem Austritt).
    const eintritt = beschaeftigung?.eintritt;
    const austritt = beschaeftigung?.austritt;
    if ((eintritt && datum < eintritt) || (austritt && datum > austritt)) continue;

    const tagesSoll = getNormalWorkingHours(dateObj);
    const istFeiertag = holidaySet?.has(datum) === true;
    soll += tagesSoll;              // 0 an Fr/Sa/So

    const bal = byDay.get(datum);
    if (bal) {
      // Ist im GLEICHEN Zeitfenster wie Soll summieren — sonst zählen im
      // laufenden Monat vorab gebuchte Tage (z.B. Urlaub in der Zukunft) ins
      // Ist, aber nicht ins Soll, und die drei Zahlen widersprechen sich.
      ist += bal.ist;
      // Auch an arbeitsfreien Tagen zählen: Freitags-/Wochenendarbeit hat
      // Soll 0 und damit den vollen Ist-Wert als Plus.
      saldo += bal.saldo;
    } else if (tagesSoll > 0 && !istFeiertag) {
      saldo -= tagesSoll;           // Werktag ganz ohne Erfassung
      fehlendeWerktage.push(datum);
    }
    // Feiertag ohne Buchung: Soll gezählt, Saldo neutral (gilt als erfüllt).
  }

  return { ist, soll, saldo, fehlendeWerktage, bisHeute: isCurrentMonth, zukunft: isFutureMonth };
}

/**
 * Saldo-Summe über die gegebenen Einträge — nur Tage MIT Einträgen.
 * Achtung: kennt keine fehlenden Werktage. Für das angezeigte Stundenkonto
 * stattdessen totalAutoSaldoKalender verwenden (konsistent mit Saldo Monat).
 */
export function totalAutoSaldo(entries: TimeEntryLite[], holidaySet?: Set<string>): number {
  return aggregateByDay(entries, holidaySet).reduce((s, d) => s + d.saldo, 0);
}

/**
 * KALENDER-basierter Auto-Saldo über die gesamte Historie: Summe der
 * Monats-Salden von (Eintritt bzw. erstem Eintrag) bis heute.
 *
 * Damit gilt: Auto-Saldo = Summe aller "Saldo Monat"-Werte — die Zahlen
 * lassen sich gegenseitig nachrechnen. totalAutoSaldo (nur Tage mit
 * Einträgen) ignorierte fehlende Werktage, die im Monats-Saldo sehr wohl
 * als Minus erschienen: Stundenkonto und Monatsansicht widersprachen sich.
 */
export function totalAutoSaldoKalender(
  entries: TimeEntryLite[],
  holidaySet?: Set<string>,
  today: Date = new Date(),
  beschaeftigung?: { eintritt?: string | null; austritt?: string | null },
): number {
  const daten = entries.map(e => e?.datum).filter(Boolean).sort();
  // Start: Eintrittsdatum, sonst erster Eintrag. Ohne beides gibt es nichts zu rechnen.
  const startStr = beschaeftigung?.eintritt || daten[0];
  if (!startStr) return 0;
  const start = new Date(startStr + "T12:00:00");
  if (isNaN(start.getTime())) return 0;

  // Ohne hinterlegtes Eintrittsdatum gilt der erste Eintrag als Eintritt —
  // sonst würden die Werktage davor (im ersten Monat) als fehlend zählen.
  const effektiveBeschaeftigung = {
    eintritt: beschaeftigung?.eintritt || daten[0],
    austritt: beschaeftigung?.austritt ?? null,
  };

  let sum = 0;
  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  const endOrd = today.getFullYear() * 12 + today.getMonth();
  while (y * 12 + (m - 1) <= endOrd) {
    sum += aggregateMonth(entries, y, m, holidaySet, today, effektiveBeschaeftigung).saldo;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return sum;
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
