import { describe, it, expect } from "vitest";
import {
  istGutschrift,
  belegArtLabel,
  vorzeichenBrutto,
  vorzeichenNetto,
  summeBrutto,
  summeNetto,
  formatBetrag,
  formatBelegBrutto,
} from "./purchaseInvoiceAmounts";

describe("istGutschrift", () => {
  it("erkennt die Gutschrift", () => {
    expect(istGutschrift("gutschrift")).toBe(true);
  });

  it("ist trim- und großschreibungssicher", () => {
    expect(istGutschrift("  gutschrift ")).toBe(true);
    expect(istGutschrift("Gutschrift")).toBe(true);
  });

  it("behandelt alles andere als Rechnung", () => {
    expect(istGutschrift("rechnung")).toBe(false);
    expect(istGutschrift("")).toBe(false);
    expect(istGutschrift(null)).toBe(false);
    expect(istGutschrift(undefined)).toBe(false);
  });

  it("liefert die passende Beschriftung", () => {
    expect(belegArtLabel("gutschrift")).toBe("Gutschrift");
    expect(belegArtLabel("rechnung")).toBe("Rechnung");
    expect(belegArtLabel(null)).toBe("Rechnung");
  });
});

describe("vorzeichenBrutto", () => {
  it("lässt eine Rechnung positiv", () => {
    expect(vorzeichenBrutto({ beleg_art: "rechnung", betrag_brutto: 500 })).toBe(500);
  });

  it("macht aus einer Gutschrift ein Minus", () => {
    expect(vorzeichenBrutto({ beleg_art: "gutschrift", betrag_brutto: 500 })).toBe(-500);
  });

  it("behandelt einen fehlenden beleg_art wie eine Rechnung (Bestandsdaten)", () => {
    expect(vorzeichenBrutto({ betrag_brutto: 120.5 })).toBe(120.5);
    expect(vorzeichenBrutto({ beleg_art: null, betrag_brutto: 120.5 })).toBe(120.5);
  });

  it("negiert einen bereits negativ gespeicherten Gutschriftbetrag nicht doppelt", () => {
    expect(vorzeichenBrutto({ beleg_art: "gutschrift", betrag_brutto: -500 })).toBe(-500);
  });

  it("verarbeitet Beträge aus Eingabefeldern (String, Komma)", () => {
    expect(vorzeichenBrutto({ beleg_art: "rechnung", betrag_brutto: "1234.56" })).toBe(1234.56);
    expect(vorzeichenBrutto({ beleg_art: "gutschrift", betrag_brutto: "1234,56" })).toBe(-1234.56);
  });

  it("liefert 0 statt NaN bei leerem oder unlesbarem Betrag", () => {
    expect(vorzeichenBrutto({ beleg_art: "rechnung", betrag_brutto: null })).toBe(0);
    expect(vorzeichenBrutto({ beleg_art: "rechnung", betrag_brutto: "" })).toBe(0);
    expect(vorzeichenBrutto({ beleg_art: "gutschrift", betrag_brutto: "abc" })).toBe(-0);
    expect(vorzeichenBrutto({})).toBe(0);
  });
});

describe("vorzeichenNetto", () => {
  it("folgt derselben Regel wie das Brutto", () => {
    expect(vorzeichenNetto({ beleg_art: "rechnung", betrag_netto: 100 })).toBe(100);
    expect(vorzeichenNetto({ beleg_art: "gutschrift", betrag_netto: 100 })).toBe(-100);
    expect(vorzeichenNetto({ beleg_art: "gutschrift", betrag_netto: null })).toBe(-0);
  });
});

describe("summeBrutto", () => {
  it("zieht Gutschriften von den Rechnungen ab", () => {
    const belege = [
      { beleg_art: "rechnung", betrag_brutto: 1000 },
      { beleg_art: "rechnung", betrag_brutto: 500 },
      { beleg_art: "gutschrift", betrag_brutto: 200 },
    ];
    expect(summeBrutto(belege)).toBe(1300);
  });

  it("kann ins Minus laufen, wenn die Gutschriften überwiegen", () => {
    const belege = [
      { beleg_art: "rechnung", betrag_brutto: 100 },
      { beleg_art: "gutschrift", betrag_brutto: 350 },
    ];
    expect(summeBrutto(belege)).toBe(-250);
  });

  it("rundet auf Cent statt Fließkomma-Reste mitzuschleppen", () => {
    const belege = [
      { beleg_art: "rechnung", betrag_brutto: 0.1 },
      { beleg_art: "rechnung", betrag_brutto: 0.2 },
    ];
    expect(summeBrutto(belege)).toBe(0.3);
  });

  it("ist bei einer leeren Liste 0", () => {
    expect(summeBrutto([])).toBe(0);
  });

  it("behandelt Bestandsdaten ohne beleg_art als Rechnungen", () => {
    expect(summeBrutto([{ betrag_brutto: 80 }, { betrag_brutto: 20 }])).toBe(100);
  });

  it("summiert netto nach derselben Regel", () => {
    const belege = [
      { beleg_art: "rechnung", betrag_netto: 1000 },
      { beleg_art: "gutschrift", betrag_netto: 250 },
    ];
    expect(summeNetto(belege)).toBe(750);
  });
});

describe("formatBetrag", () => {
  it("schreibt positive Beträge ohne Vorzeichen", () => {
    expect(formatBetrag(1234.5)).toBe("€ 1234.50");
  });

  it("setzt das Minus vor das Euro-Zeichen", () => {
    expect(formatBetrag(-1234.5)).toBe("− € 1234.50");
  });

  it("zeigt die Null ohne Vorzeichen", () => {
    expect(formatBetrag(0)).toBe("€ 0.00");
  });

  it("formatiert einen einzelnen Beleg samt Vorzeichen", () => {
    expect(formatBelegBrutto({ beleg_art: "gutschrift", betrag_brutto: 99.9 })).toBe("− € 99.90");
    expect(formatBelegBrutto({ beleg_art: "rechnung", betrag_brutto: 99.9 })).toBe("€ 99.90");
  });
});

describe("Praxisfall: offene Lieferantenverbindlichkeit", () => {
  it("rechnet die Gutschrift aus den offenen Posten heraus", () => {
    // Drei offene Belege eines Lieferanten, darunter eine Gutschrift für
    // retourniertes Material. Offen bleibt die Differenz.
    const offen = [
      { beleg_art: "rechnung", betrag_brutto: 2400, betrag_netto: 2000 },
      { beleg_art: "rechnung", betrag_brutto: 600, betrag_netto: 500 },
      { beleg_art: "gutschrift", betrag_brutto: 360, betrag_netto: 300 },
    ];
    expect(summeBrutto(offen)).toBe(2640);
    expect(summeNetto(offen)).toBe(2200);
  });
});
