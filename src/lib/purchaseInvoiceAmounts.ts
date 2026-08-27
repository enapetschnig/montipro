// Lieferantengutschriften — die Vorzeichen-Logik an genau EINER Stelle.
//
// In der Datenbank steht der Betrag einer Gutschrift POSITIV, genau so, wie er
// auf dem Beleg gedruckt ist (der Constraint betrag_brutto >= 0 bleibt damit
// als Tippfehler-Schutz erhalten). Erst hier wird daraus ein Minus.
//
// Jede Summe über Eingangsrechnungen muss durch diese Helfer laufen — sonst
// addiert sie eine Gutschrift zu den Verbindlichkeiten dazu, statt sie
// abzuziehen.

export type BelegArt = "rechnung" | "gutschrift";

/** Nur die Felder, die für die Betragsrechnung gebraucht werden. */
export interface BelegBetrag {
  beleg_art?: string | null;
  betrag_brutto?: number | string | null;
  betrag_netto?: number | string | null;
}

/**
 * Ist der Beleg eine Gutschrift? Trim-sicher, weil der Wert aus der DB,
 * aus einem Formular oder aus dem KI-Scan kommen kann.
 */
export function istGutschrift(belegArt?: string | null): boolean {
  return (belegArt ?? "").trim().toLowerCase() === "gutschrift";
}

/** Beschriftung für Übersichten, Dialoge und Exporte. */
export function belegArtLabel(belegArt?: string | null): string {
  return istGutschrift(belegArt) ? "Gutschrift" : "Rechnung";
}

/**
 * Zahl-sicher: Beträge kommen aus Inputs auch als String ("1234,56"),
 * aus der DB als number und aus leeren Feldern als "" oder null.
 */
function zuZahl(wert: number | string | null | undefined): number {
  if (wert === null || wert === undefined || wert === "") return 0;
  const n = typeof wert === "number" ? wert : Number(String(wert).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Rundet auf Cent — sonst schleppt jede Summe die 0.1+0.2-Ungenauigkeit mit. */
function aufCent(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bruttobetrag mit Vorzeichen: Gutschrift negativ, Rechnung positiv.
 * Math.abs schützt davor, einen (regelwidrig) negativ gespeicherten
 * Gutschriftbetrag ein zweites Mal zu negieren.
 */
export function vorzeichenBrutto(beleg: BelegBetrag): number {
  const betrag = Math.abs(zuZahl(beleg.betrag_brutto));
  return istGutschrift(beleg.beleg_art) ? -betrag : betrag;
}

/** Nettobetrag mit Vorzeichen — gleiche Regel wie beim Brutto. */
export function vorzeichenNetto(beleg: BelegBetrag): number {
  const betrag = Math.abs(zuZahl(beleg.betrag_netto));
  return istGutschrift(beleg.beleg_art) ? -betrag : betrag;
}

/** Summe brutto über eine Liste — Gutschriften sind abgezogen. */
export function summeBrutto(belege: BelegBetrag[]): number {
  return aufCent(belege.reduce((s, b) => s + vorzeichenBrutto(b), 0));
}

/** Summe netto über eine Liste — Gutschriften sind abgezogen. */
export function summeNetto(belege: BelegBetrag[]): number {
  return aufCent(belege.reduce((s, b) => s + vorzeichenNetto(b), 0));
}

/**
 * Betrag für die Anzeige: "€ 1234.56" bzw. "− € 1234.56".
 * Zwei Nachkommastellen wie überall sonst in den Belegübersichten; das
 * Minus steht vor dem Euro-Zeichen, weil "€ −1234.56" schlechter lesbar ist.
 */
export function formatBetrag(wert: number): string {
  const negativ = wert < 0;
  return `${negativ ? "− " : ""}€ ${Math.abs(wert).toFixed(2)}`;
}

/** Kurzform für einen einzelnen Beleg: Vorzeichen + Formatierung in einem. */
export function formatBelegBrutto(beleg: BelegBetrag): string {
  return formatBetrag(vorzeichenBrutto(beleg));
}
