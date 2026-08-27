import { describe, it, expect, vi, beforeEach } from "vitest";

// Storage wird gemockt: die Testdateien liegen in einer Map, der Rest der
// Funktion (das echte Zusammenbauen per pdf-lib) läuft unverändert.
const dateien = new Map<string, Uint8Array>();
const downloadFehler = new Map<string, string>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) }) }),
    storage: {
      from: () => ({
        download: async (pfad: string) => {
          if (downloadFehler.has(pfad)) {
            return { data: null, error: { message: downloadFehler.get(pfad) } };
          }
          const bytes = dateien.get(pfad);
          if (!bytes) return { data: null, error: { message: "Datei nicht gefunden" } };
          return { data: new Blob([bytes], { type: "application/pdf" }), error: null };
        },
      }),
    },
  },
}));

import {
  mitAnlagenZusammenfuegen,
  zumAnhaengen,
  zumBeilegen,
  formatGroesse,
  sichererDateiname,
  istPdf,
  istBild,
  verstaendlicherFehler,
  pdfInfo,
  type InvoiceAttachment,
} from "./invoiceAttachments";

/** Erzeugt ein echtes PDF mit der gewünschten Seitenzahl. */
async function baueTestPdf(seiten: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) doc.addPage([595.28, 841.89]);
  return await doc.save();
}

async function seitenZahl(blob: Blob): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPageCount();
}

function anlage(over: Partial<InvoiceAttachment> = {}): InvoiceAttachment {
  return {
    id: over.id ?? "a1",
    invoice_id: "inv1",
    file_path: over.file_path ?? "inv1/datei.pdf",
    file_name: over.file_name ?? "datei.pdf",
    mime_type: over.mime_type ?? "application/pdf",
    file_size: over.file_size ?? 1000,
    modus: over.modus ?? "anhaengen",
    seiten: over.seiten ?? null,
    sort_order: over.sort_order ?? 0,
  };
}

beforeEach(() => {
  dateien.clear();
  downloadFehler.clear();
});

describe("Aufteilung der Anlagen", () => {
  const liste = [
    anlage({ id: "b", modus: "anhaengen", sort_order: 2, file_name: "zweite.pdf" }),
    anlage({ id: "a", modus: "anhaengen", sort_order: 1, file_name: "erste.pdf" }),
    anlage({ id: "c", modus: "separat", sort_order: 3, file_name: "beilage.pdf" }),
  ];

  it("nimmt nur die anzuhängenden, in der gesetzten Reihenfolge", () => {
    expect(zumAnhaengen(liste).map(a => a.file_name)).toEqual(["erste.pdf", "zweite.pdf"]);
  });

  it("nimmt für die Email nur die separaten", () => {
    expect(zumBeilegen(liste).map(a => a.file_name)).toEqual(["beilage.pdf"]);
  });

  it("behandelt einen fehlenden Modus als anhängen", () => {
    expect(zumAnhaengen([anlage({ modus: "" })])).toHaveLength(1);
  });

  it("ist trim-sicher beim Modus", () => {
    expect(zumBeilegen([anlage({ modus: " separat " })])).toHaveLength(1);
  });

  it("verändert die übergebene Liste nicht", () => {
    const original = [...liste];
    zumAnhaengen(liste);
    expect(liste).toEqual(original);
  });
});

describe("Zusammenbau", () => {
  it("gibt ohne Anlagen das unveränderte Original zurück", async () => {
    const basis = new Blob([await baueTestPdf(2)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, []);
    // Referenzgleichheit: es wird nicht einmal neu verpackt.
    expect(ergebnis.blob).toBe(basis);
    expect(ergebnis.angehaengt).toBe(0);
    expect(ergebnis.fehler).toEqual([]);
  });

  it("rührt das Original nicht an, wenn alle Anlagen separat sind", async () => {
    const basis = new Blob([await baueTestPdf(2)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [anlage({ modus: "separat" })]);
    expect(ergebnis.blob).toBe(basis);
  });

  it("baut die Seiten einer PDF-Anlage hinten an", async () => {
    dateien.set("inv1/fenster.pdf", await baueTestPdf(3));
    const basis = new Blob([await baueTestPdf(2)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/fenster.pdf", file_name: "fenster.pdf" }),
    ]);
    expect(ergebnis.angehaengt).toBe(1);
    expect(ergebnis.fehler).toEqual([]);
    expect(await seitenZahl(ergebnis.blob)).toBe(5);
  });

  it("baut mehrere Anlagen in der gesetzten Reihenfolge an", async () => {
    dateien.set("inv1/a.pdf", await baueTestPdf(1));
    dateien.set("inv1/b.pdf", await baueTestPdf(4));
    const basis = new Blob([await baueTestPdf(2)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ id: "2", file_path: "inv1/b.pdf", file_name: "b.pdf", sort_order: 2 }),
      anlage({ id: "1", file_path: "inv1/a.pdf", file_name: "a.pdf", sort_order: 1 }),
    ]);
    expect(ergebnis.angehaengt).toBe(2);
    expect(await seitenZahl(ergebnis.blob)).toBe(7);
  });

  it("überspringt eine defekte Anlage und baut die übrigen trotzdem an", async () => {
    dateien.set("inv1/gut.pdf", await baueTestPdf(2));
    dateien.set("inv1/kaputt.pdf", new Uint8Array([1, 2, 3, 4]));
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ id: "1", file_path: "inv1/kaputt.pdf", file_name: "kaputt.pdf", sort_order: 1 }),
      anlage({ id: "2", file_path: "inv1/gut.pdf", file_name: "gut.pdf", sort_order: 2 }),
    ]);
    expect(ergebnis.angehaengt).toBe(1);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]).toContain("kaputt.pdf");
    expect(await seitenZahl(ergebnis.blob)).toBe(3);
  });

  it("meldet eine fehlende Datei, statt das Angebot scheitern zu lassen", async () => {
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/weg.pdf", file_name: "weg.pdf" }),
    ]);
    expect(ergebnis.blob).toBe(basis);
    expect(ergebnis.angehaengt).toBe(0);
    expect(ergebnis.fehler[0]).toContain("weg.pdf");
  });

  it("lehnt einen nicht unterstützten Dateityp mit klarer Meldung ab", async () => {
    dateien.set("inv1/plan.dwg", new Uint8Array([1, 2, 3]));
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/plan.dwg", file_name: "plan.dwg", mime_type: "application/acad" }),
    ]);
    expect(ergebnis.angehaengt).toBe(0);
    expect(ergebnis.fehler[0]).toContain("nur PDF, JPG und PNG");
  });

  it("erhält die Seiten der Basis unverändert", async () => {
    dateien.set("inv1/x.pdf", await baueTestPdf(1));
    const basis = new Blob([await baueTestPdf(3)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [anlage({ file_path: "inv1/x.pdf" })]);
    // Basisseiten bleiben vorne, die Anlage kommt dahinter.
    expect(await seitenZahl(ergebnis.blob)).toBe(4);
    expect(await seitenZahl(basis)).toBe(3);
  });
});

describe("Bilder als Anlage", () => {
  /** Kleinstes gültiges PNG (1x1 Pixel, transparent). */
  const einsMalEinsPng = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ), c => c.charCodeAt(0));

  it("baut ein PNG als eigene Seite an", async () => {
    dateien.set("inv1/skizze.png", einsMalEinsPng);
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/skizze.png", file_name: "skizze.png", mime_type: "image/png" }),
    ]);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.angehaengt).toBe(1);
    expect(await seitenZahl(ergebnis.blob)).toBe(2);
  });

  it("erkennt das Format am Dateiinhalt, nicht an der Endung", async () => {
    // PNG-Inhalt, aber .jpg genannt — muss trotzdem funktionieren.
    dateien.set("inv1/falsch.jpg", einsMalEinsPng);
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/falsch.jpg", file_name: "falsch.jpg", mime_type: "image/jpeg" }),
    ]);
    expect(ergebnis.angehaengt).toBe(1);
  });

  it("meldet ein unlesbares Bild verständlich statt abzustürzen", async () => {
    dateien.set("inv1/leer.png", new Uint8Array([0, 0, 0]));
    const basis = new Blob([await baueTestPdf(1)], { type: "application/pdf" });
    const ergebnis = await mitAnlagenZusammenfuegen(basis, [
      anlage({ file_path: "inv1/leer.png", file_name: "leer.png", mime_type: "image/png" }),
    ]);
    expect(ergebnis.angehaengt).toBe(0);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]).toContain("leer.png");
  });
});

describe("pdfInfo — Seitenzahl und Kopierschutz", () => {
  it("liest die Seitenzahl eines normalen PDFs", async () => {
    expect(await pdfInfo(await baueTestPdf(3))).toEqual({ seiten: 3, geschuetzt: false });
  });

  it("stuft eine beschädigte Datei NICHT als kopiergeschützt ein", async () => {
    // Wichtig: sonst landete eine bloß kaputte Datei fälschlich bei
    // "separat" und der eigentliche Fehler bliebe unentdeckt.
    expect(await pdfInfo(new Uint8Array([1, 2, 3]))).toEqual({ seiten: null, geschuetzt: false });
  });
});

describe("Fehlermeldungen", () => {
  it("erklärt den Kopierschutz und nennt den Ausweg", () => {
    const text = verstaendlicherFehler(new Error("Input document to `PDFDocument.load` is encrypted"), "Fenster.pdf");
    expect(text).toContain("Fenster.pdf");
    expect(text).toContain("kopiergeschützt");
    expect(text).toContain("Separat");
  });

  it("übersetzt eine beschädigte Datei", () => {
    const text = verstaendlicherFehler(new Error("Failed to parse PDF document (line:54 col:186 offset=497)"), "a.pdf");
    expect(text).toContain("beschädigt");
    expect(text).not.toContain("offset");
  });

  it("übersetzt ein unlesbares Bild", () => {
    expect(verstaendlicherFehler(new Error("SOI not found in JPEG"), "b.jpg")).toContain("Bild nicht lesbar");
  });

  it("gibt unbekannte Fehler unverändert weiter, mit Dateiname", () => {
    expect(verstaendlicherFehler(new Error("Etwas Seltsames"), "c.pdf")).toBe("c.pdf: Etwas Seltsames");
  });
});

describe("Dateityp-Erkennung", () => {
  it("erkennt PDFs an Typ und Endung", () => {
    expect(istPdf("application/pdf", "x")).toBe(true);
    expect(istPdf(null, "Angebot.PDF")).toBe(true);
    expect(istPdf("image/jpeg", "foto.jpg")).toBe(false);
  });

  it("erkennt JPG und PNG", () => {
    expect(istBild("image/jpeg", "x")).toBe(true);
    expect(istBild("image/png", "x")).toBe(true);
    expect(istBild(null, "skizze.PNG")).toBe(true);
    expect(istBild(null, "zeichnung.jpeg")).toBe(true);
    expect(istBild("application/pdf", "a.pdf")).toBe(false);
  });

  it("lehnt Formate ab, die sich nicht einbetten lassen (iPhone-HEIC, WEBP, GIF)", () => {
    expect(istBild("image/heic", "IMG_1234.HEIC")).toBe(false);
    expect(istBild("image/webp", "bild.webp")).toBe(false);
    expect(istBild("image/gif", "bild.gif")).toBe(false);
  });
});

describe("Anzeigehelfer", () => {
  it("formatiert Dateigrößen lesbar", () => {
    expect(formatGroesse(512)).toBe("512 B");
    expect(formatGroesse(2048)).toBe("2 KB");
    expect(formatGroesse(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatGroesse(0)).toBe("");
    expect(formatGroesse(null)).toBe("");
  });

  it("macht Dateinamen speichersicher und behält die Endung", () => {
    expect(sichererDateiname("Angebot Fenster GmbH.pdf")).toBe("Angebot_Fenster_GmbH.pdf");
    expect(sichererDateiname("Tür & Maß.pdf")).toMatch(/\.pdf$/);
    expect(sichererDateiname("Übersicht.pdf")).not.toMatch(/[^\x20-\x7E]/);
  });
});
