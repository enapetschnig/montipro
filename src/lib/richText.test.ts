import { describe, it, expect } from "vitest";
import {
  istFormatiert,
  enthaeltAuszeichnung,
  istLeer,
  normalisiere,
  alsText,
  textZuHtml,
  htmlZuAbschnitte,
  umbrecheAbschnitte,
  hexZuRgb,
  type TextAbschnitt,
} from "./richText";

/** Messung für die Tests: jedes Zeichen 1 breit, fett 2. */
const messen = (text: string, stil: TextAbschnitt) => text.length * (stil.fett ? 2 : 1);

describe("istFormatiert", () => {
  it("erkennt Editor-HTML", () => {
    expect(istFormatiert("<p>Hallo</p>")).toBe(true);
    expect(istFormatiert("Text mit <strong>fett</strong>")).toBe(true);
  });

  it("behandelt alte Klartexte als unformatiert", () => {
    expect(istFormatiert("Nur Text\nmit Umbruch")).toBe(false);
    expect(istFormatiert("2 < 3 und 5 > 4")).toBe(false);
    expect(istFormatiert("")).toBe(false);
    expect(istFormatiert(null)).toBe(false);
  });

  it("hält Maßangaben in spitzen Klammern für Klartext", () => {
    // "<b 50>" sieht aus wie ein Tag — wäre es HTML, verschwände die Angabe.
    expect(istFormatiert("U-Profil <b 50> verzinkt")).toBe(false);
    expect(alsText("U-Profil <b 50> verzinkt")).toBe("U-Profil <b 50> verzinkt");
    expect(istFormatiert("Winkel <i 30> mm")).toBe(false);
  });
});

describe("enthaeltAuszeichnung", () => {
  it("erkennt echte Auszeichnung", () => {
    expect(enthaeltAuszeichnung("<p><strong>fett</strong></p>")).toBe(true);
    expect(enthaeltAuszeichnung('<p><span style="color:#e60000">rot</span></p>')).toBe(true);
    expect(enthaeltAuszeichnung("<ul><li>Punkt</li></ul>")).toBe(true);
  });

  it("wertet bloße Absätze nicht als Auszeichnung", () => {
    // Sonst blockiert jedes über den Editor gespeicherte Material das
    // schnelle Tippen in der Positionszeile.
    expect(enthaeltAuszeichnung("<p>Nur ein Absatz</p>")).toBe(false);
    expect(enthaeltAuszeichnung("<p>Zeile eins</p><p>Zeile zwei</p>")).toBe(false);
  });

  it("wertet Klartext nicht als Auszeichnung", () => {
    expect(enthaeltAuszeichnung("Text")).toBe(false);
    expect(enthaeltAuszeichnung("U-Profil <b 50> verzinkt")).toBe(false);
    expect(enthaeltAuszeichnung(null)).toBe(false);
  });
});

describe("istLeer und normalisiere", () => {
  it("erkennt das leere Editor-Ergebnis", () => {
    // Der Editor hinterlässt das beim bloßen Hineinklicken.
    expect(istLeer("<p><br></p>")).toBe(true);
    expect(istLeer("<p></p>")).toBe(true);
    expect(istLeer("   ")).toBe(true);
    expect(istLeer("")).toBe(true);
    expect(istLeer(null)).toBe(true);
  });

  it("erkennt echten Inhalt", () => {
    expect(istLeer("<p>Text</p>")).toBe(false);
    expect(istLeer("Text")).toBe(false);
  });

  it("macht aus leerem Markup einen leeren Text", () => {
    expect(normalisiere("<p><br></p>")).toBe("");
    expect(normalisiere("<p>Inhalt</p>")).toBe("<p>Inhalt</p>");
    expect(normalisiere(null)).toBe("");
  });
});

describe("alsText", () => {
  it("gibt Klartext unverändert zurück", () => {
    expect(alsText("Sicherheitsglas 4 mm")).toBe("Sicherheitsglas 4 mm");
  });

  it("entfernt Formatierung", () => {
    expect(alsText("<p><strong>Sicherheitsglas</strong> 4 mm</p>")).toBe("Sicherheitsglas 4 mm");
  });

  it("macht aus Absätzen Zeilenumbrüche", () => {
    expect(alsText("<p>Erste</p><p>Zweite</p>")).toBe("Erste\nZweite");
  });

  it("löst Sonderzeichen auf", () => {
    expect(alsText("<p>M&amp;M &nbsp;Gr&#246;&szlig;e</p>")).toContain("M&M");
  });

  it("kennzeichnet Aufzählungen", () => {
    expect(alsText("<ul><li>Eins</li><li>Zwei</li></ul>")).toBe("• Eins\n• Zwei");
  });

  it("liefert bei leerer Eingabe einen leeren String", () => {
    expect(alsText("")).toBe("");
    expect(alsText(null)).toBe("");
    expect(alsText(undefined)).toBe("");
  });

  it("macht aus einem leeren Absatz keinen Textmüll", () => {
    expect(alsText("<p><br></p>")).toBe("");
  });
});

describe("textZuHtml", () => {
  it("wandelt Zeilenumbrüche in Absätze", () => {
    expect(textZuHtml("Eins\nZwei")).toBe("<p>Eins</p><p>Zwei</p>");
  });

  it("schützt Sonderzeichen", () => {
    expect(textZuHtml("2 < 3 & mehr")).toBe("<p>2 &lt; 3 &amp; mehr</p>");
  });

  it("lässt bereits formatierten Text unangetastet", () => {
    expect(textZuHtml("<p>schon HTML</p>")).toBe("<p>schon HTML</p>");
  });

  it("ist bei leerer Eingabe leer", () => {
    expect(textZuHtml("")).toBe("");
    expect(textZuHtml(null)).toBe("");
  });

  it("überlebt den Rundweg Text → HTML → Text", () => {
    const original = "Erste Zeile\nZweite Zeile";
    expect(alsText(textZuHtml(original))).toBe(original);
  });

  it("erhält mit Leerzeichen gesetzte Spalten", () => {
    // Alte Langtexte richten Spalten oft mit Leerzeichen aus. HTML würde sie
    // zu einem einzigen zusammenfalten.
    const original = "Pos 1    2 Stk";
    const zurueck = alsText(textZuHtml(original));
    expect(zurueck.replace(/ /g, " ")).toBe(original);
  });

  it("erhält eine Einrückung am Zeilenanfang", () => {
    // trim() würde das geschützte Leerzeichen mitentfernen.
    const zurueck = alsText(textZuHtml("   eingerückt"));
    expect(zurueck.replace(/\u00a0/g, " ")).toBe("   eingerückt");
  });
});

describe("htmlZuAbschnitte", () => {
  it("erkennt fett, kursiv und unterstrichen", () => {
    const a = htmlZuAbschnitte("<p><strong>fett</strong><em>kursiv</em><u>unter</u></p>");
    expect(a).toEqual([
      { text: "fett", fett: true },
      { text: "kursiv", kursiv: true },
      { text: "unter", unterstrichen: true },
    ]);
  });

  it("kombiniert verschachtelte Formatierung", () => {
    const a = htmlZuAbschnitte("<p><strong><em>beides</em></strong></p>");
    expect(a).toEqual([{ text: "beides", fett: true, kursiv: true }]);
  });

  it("liest die Farbe aus dem Editor (rgb)", () => {
    const a = htmlZuAbschnitte('<p><span style="color: rgb(230, 0, 0);">rot</span></p>');
    expect(a).toEqual([{ text: "rot", farbe: "#e60000" }]);
  });

  it("liest die Farbe auch als Hex, kurz wie lang", () => {
    expect(htmlZuAbschnitte('<p><span style="color:#e60000">x</span></p>')[0].farbe).toBe("#e60000");
    expect(htmlZuAbschnitte('<p><span style="color:#f00">x</span></p>')[0].farbe).toBe("#ff0000");
  });

  it("ignoriert Schwarz als überflüssige Angabe", () => {
    expect(htmlZuAbschnitte('<p><span style="color: rgb(0,0,0);">x</span></p>')[0].farbe).toBeUndefined();
  });

  it("setzt zwischen Absätzen einen Umbruch", () => {
    const a = htmlZuAbschnitte("<p>Eins</p><p>Zwei</p>");
    expect(a.map(s => s.text)).toEqual(["Eins", "\n", "Zwei"]);
  });

  it("übersetzt <br> in einen Umbruch", () => {
    expect(htmlZuAbschnitte("<p>Eins<br>Zwei</p>").map(s => s.text)).toEqual(["Eins", "\n", "Zwei"]);
  });

  it("hängt keinen Umbruch ans Ende", () => {
    const a = htmlZuAbschnitte("<p>Nur eins</p>");
    expect(a).toEqual([{ text: "Nur eins" }]);
  });

  it("zerlegt alten Klartext an den Zeilenumbrüchen", () => {
    expect(htmlZuAbschnitte("Eins\nZwei").map(s => s.text)).toEqual(["Eins", "\n", "Zwei"]);
  });

  it("behält den Inhalt unbekannter Tags", () => {
    expect(htmlZuAbschnitte("<p><mark>wichtig</mark></p>")[0].text).toBe("wichtig");
  });

  it("verliert bei unvollständigem HTML keinen Text", () => {
    const a = htmlZuAbschnitte("<p><strong>offen");
    expect(a.map(s => s.text).join("")).toBe("offen");
  });

  it("setzt Aufzählungszeichen", () => {
    const a = htmlZuAbschnitte("<ul><li>Eins</li><li>Zwei</li></ul>");
    expect(a.map(s => s.text)).toEqual(["• ", "Eins", "\n", "• ", "Zwei"]);
  });

  it("ist bei leerer Eingabe leer", () => {
    expect(htmlZuAbschnitte("")).toEqual([]);
    expect(htmlZuAbschnitte(null)).toEqual([]);
  });
});

describe("umbrecheAbschnitte", () => {
  it("bricht an der Breite um", () => {
    const zeilen = umbrecheAbschnitte([{ text: "aaa bbb ccc" }], 7, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["aaa bbb", "ccc"]);
  });

  it("berücksichtigt die Breite der Formatierung", () => {
    // "aaa" fett = 6 breit, passt nicht mehr zu "bbb" (3) in 7.
    const zeilen = umbrecheAbschnitte(
      [{ text: "bbb ", }, { text: "aaa", fett: true }],
      7,
      messen,
    );
    expect(zeilen).toHaveLength(2);
  });

  it("übernimmt harte Umbrüche", () => {
    const zeilen = umbrecheAbschnitte([{ text: "a" }, { text: "\n" }, { text: "b" }], 100, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["a", "b"]);
  });

  it("erhält Leerzeilen zwischen Absätzen", () => {
    const zeilen = umbrecheAbschnitte(
      [{ text: "a" }, { text: "\n" }, { text: "\n" }, { text: "b" }],
      100,
      messen,
    );
    expect(zeilen).toHaveLength(3);
    expect(zeilen[1]).toEqual([]);
  });

  it("trennt ein überlanges Wort, statt über den Rand zu laufen", () => {
    const zeilen = umbrecheAbschnitte([{ text: "ABCDEFGHIJ" }], 4, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["ABCD", "EFGH", "IJ"]);
    zeilen.forEach(z => {
      const breite = z.reduce((s, seg) => s + messen(seg.text, seg), 0);
      expect(breite).toBeLessThanOrEqual(4);
    });
  });

  it("fasst gleich formatierte Stücke in einer Zeile zusammen", () => {
    const zeilen = umbrecheAbschnitte([{ text: "aa" }, { text: " bb" }], 100, messen);
    expect(zeilen[0]).toHaveLength(1);
    expect(zeilen[0][0].text).toBe("aa bb");
  });

  it("hält verschiedene Formatierungen getrennt", () => {
    const zeilen = umbrecheAbschnitte([{ text: "normal " }, { text: "fett", fett: true }], 100, messen);
    expect(zeilen[0]).toHaveLength(2);
    expect(zeilen[0][1].fett).toBe(true);
  });

  it("verschluckt das Leerzeichen am Zeilenumbruch", () => {
    const zeilen = umbrecheAbschnitte([{ text: "aaaa bbbb" }], 4, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["aaaa", "bbbb"]);
  });

  it("liefert für leeren Text genau eine leere Zeile", () => {
    expect(umbrecheAbschnitte([], 100, messen)).toEqual([[]]);
  });

  it("behält eine Leerzeile am Ende, wenn der Text auf Enter endet", () => {
    // Sonst würde eine bestehende Position im PDF plötzlich kürzer und der
    // Seitenumbruch könnte wandern.
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte("Text\n"), 100, messen);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[1]).toEqual([]);
  });

  it("zählt zwei Enter am Ende als zwei Leerzeilen", () => {
    expect(umbrecheAbschnitte(htmlZuAbschnitte("Text\n\n"), 100, messen)).toHaveLength(3);
  });

  it("hängt bei Editor-HTML keine Leerzeile an", () => {
    expect(umbrecheAbschnitte(htmlZuAbschnitte("<p>Text</p>"), 100, messen)).toHaveLength(1);
  });

  it("zählt eine Leerzeile aus dem Editor genau einmal", () => {
    // Der Editor schreibt eine leere Zeile als "<p><br></p>". Das <br> ist
    // Füllzeichen — würde man es mitzählen, entstünden zwei Leerzeilen.
    const zeilen = umbrecheAbschnitte(
      htmlZuAbschnitte("<p>Zeile A</p><p><br></p><p>Zeile B</p>"), 100, messen,
    );
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["Zeile A", "", "Zeile B"]);
  });

  it("behält eine Leerzeile am Textanfang", () => {
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte("<p><br></p><p>Zeile A</p>"), 100, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["", "Zeile A"]);
  });

  it("behält eine Leerzeile am Textende", () => {
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte("<p>Zeile A</p><p><br></p>"), 100, messen);
    expect(zeilen).toHaveLength(2);
  });

  it("zählt eine Aufzählung Zeile für Zeile", () => {
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte("<ul><li>Eins</li><li>Zwei</li></ul>"), 100, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["• Eins", "• Zwei"]);
  });

  it("bildet die Zeilenzahl eines Absatztextes gleich ab wie den Klartext", () => {
    // Beide Schreibweisen desselben Textes müssen im PDF gleich hoch werden.
    const alsKlartext = umbrecheAbschnitte(htmlZuAbschnitte("A\n\nB"), 100, messen);
    const ausEditor = umbrecheAbschnitte(
      htmlZuAbschnitte("<p>A</p><p><br></p><p>B</p>"), 100, messen,
    );
    expect(ausEditor).toHaveLength(alsKlartext.length);
  });

  it("überschreitet die Breite in keiner Zeile", () => {
    const abschnitte: TextAbschnitt[] = [
      { text: "Sicherheitsglas nach " },
      { text: "ÖNORM B 3716", fett: true },
      { text: " inklusive Montage und Abdichtung" },
    ];
    const zeilen = umbrecheAbschnitte(abschnitte, 20, messen);
    zeilen.forEach(z => {
      const breite = z.reduce((s, seg) => s + messen(seg.text, seg), 0);
      expect(breite).toBeLessThanOrEqual(20);
    });
    // Kein Text darf dabei verloren gehen.
    const zusammen = zeilen.map(z => z.map(s => s.text).join("")).join(" ");
    expect(zusammen.replace(/\s+/g, " ")).toBe(
      "Sicherheitsglas nach ÖNORM B 3716 inklusive Montage und Abdichtung"
    );
  });
});

describe("hexZuRgb", () => {
  it("wandelt Hex in RGB-Werte", () => {
    expect(hexZuRgb("#e60000")).toEqual([230, 0, 0]);
    expect(hexZuRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(hexZuRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("gibt bei fehlender oder ungültiger Farbe nichts zurück", () => {
    expect(hexZuRgb(undefined)).toBeUndefined();
    expect(hexZuRgb("rot")).toBeUndefined();
    expect(hexZuRgb("#fff")).toBeUndefined();
  });
});

describe("Zusammenspiel: Editor-HTML bis zur umbrochenen Zeile", () => {
  it("trägt Formatierung durch die ganze Kette", () => {
    const html = '<p>Glas <strong>ESG 6mm</strong> <span style="color: rgb(230, 0, 0);">Achtung</span></p>';
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte(html), 100, messen);
    expect(zeilen).toHaveLength(1);
    const stuecke = zeilen[0];
    expect(stuecke.find(s => s.text.includes("ESG"))?.fett).toBe(true);
    expect(stuecke.find(s => s.text.includes("Achtung"))?.farbe).toBe("#e60000");
    expect(stuecke.map(s => s.text).join("")).toBe("Glas ESG 6mm Achtung");
  });

  it("verarbeitet einen alten Klartext-Langtext unverändert", () => {
    const alt = "Zeile eins\nZeile zwei";
    const zeilen = umbrecheAbschnitte(htmlZuAbschnitte(alt), 100, messen);
    expect(zeilen.map(z => z.map(s => s.text).join(""))).toEqual(["Zeile eins", "Zeile zwei"]);
  });
});
