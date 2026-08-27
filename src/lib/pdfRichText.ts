// Formatierten Langtext ins PDF zeichnen.
//
// Die PDF-Bibliothek kennt kein HTML — sie malt Zeichenketten. Deshalb wird
// der Text hier in Abschnitte zerlegt, Zeile für Zeile umbrochen und jeder
// Abschnitt in seiner eigenen Schrift und Farbe gesetzt.
//
// Alte, unformatierte Langtexte laufen durch dieselbe Kette und sehen aus
// wie bisher (grau, kursiv) — dafür sorgt `basisKursiv`.

import {
  htmlZuAbschnitte,
  umbrecheAbschnitte,
  hexZuRgb,
  type TextAbschnitt,
  type TextZeile,
} from "./richText";

type PdfLike = {
  setFont: (name: string, stil: string) => void;
  setFontSize: (groesse: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  getTextWidth: (text: string) => number;
  text: (text: string, x: number, y: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (breite: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
};

/**
 * Geschützte Leerzeichen (U+00A0) auf gewöhnliche zurückführen.
 * Die PDF-Bibliothek kennt für U+00A0 keine Breite und rechnet fast das
 * Doppelte — Umbruch und Cursor liefen sonst auseinander. Im fertigen PDF
 * steht damit außerdem ein normales Leerzeichen, das sich kopieren und
 * durchsuchen lässt.
 */
function fuerPdf(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    // Tabulator ebenso: die Bibliothek zeichnet ihn als acht Leerzeichen,
    // misst ihn aber wie ein einziges Zeichen. Ohne das Ersetzen wird eine
    // Zeile mit Tabulatoren rund 9 mm breiter als berechnet und l\u00e4uft \u00fcber
    // den Spaltenrand hinaus.
    .replace(/\t/g, "        ");
}

function schriftStil(abschnitt: TextAbschnitt, basisKursiv: boolean): string {
  const kursiv = abschnitt.kursiv || basisKursiv;
  if (abschnitt.fett && kursiv) return "bolditalic";
  if (abschnitt.fett) return "bold";
  if (kursiv) return "italic";
  return "normal";
}

/**
 * Zerlegt den Langtext und bricht ihn auf die Spaltenbreite um.
 * Das Ergebnis wird zweimal gebraucht: einmal für die Zeilenzahl (die
 * Zeilenhöhe der Tabelle muss vorher feststehen) und einmal zum Zeichnen.
 */
export function langtextZeilen(
  pdf: PdfLike,
  inhalt: string,
  breite: number,
  schriftgroesse: number,
  basisKursiv = true,
): TextZeile[] {
  const abschnitte = htmlZuAbschnitte(inhalt);
  pdf.setFontSize(schriftgroesse);
  const zeilen = umbrecheAbschnitte(abschnitte, breite, (text, stil) => {
    pdf.setFont("helvetica", schriftStil(stil, basisKursiv));
    return pdf.getTextWidth(fuerPdf(text));
  });
  pdf.setFont("helvetica", "normal");
  return zeilen;
}

/**
 * Zeichnet die umbrochenen Zeilen. `baselineY` ist die Grundlinie der
 * ersten Zeile, `zeilenhoehe` der Abstand zur nächsten (beides in mm).
 * Setzt Schrift und Farbe danach wieder zurück.
 */
export function zeichneLangtext(
  pdf: PdfLike,
  zeilen: TextZeile[],
  x: number,
  baselineY: number,
  schriftgroesse: number,
  zeilenhoehe: number,
  grundfarbe: [number, number, number] = [120, 120, 120],
  basisKursiv = true,
): void {
  pdf.setFontSize(schriftgroesse);
  zeilen.forEach((zeile, index) => {
    const y = baselineY + index * zeilenhoehe;
    let cursorX = x;
    for (const abschnitt of zeile) {
      if (!abschnitt.text) continue;
      pdf.setFont("helvetica", schriftStil(abschnitt, basisKursiv));
      const farbe = hexZuRgb(abschnitt.farbe) || grundfarbe;
      pdf.setTextColor(farbe[0], farbe[1], farbe[2]);
      const text = fuerPdf(abschnitt.text);
      pdf.text(text, cursorX, y);
      const breite = pdf.getTextWidth(text);
      if (abschnitt.unterstrichen) {
        // Die Bibliothek kennt keine Unterstreichung — als feine Linie
        // knapp unter der Grundlinie nachziehen.
        pdf.setDrawColor(farbe[0], farbe[1], farbe[2]);
        pdf.setLineWidth(0.15);
        pdf.line(cursorX, y + 0.6, cursorX + breite, y + 0.6);
      }
      cursorX += breite;
    }
  });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(0, 0, 0);
}
