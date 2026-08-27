// Anlagen zu Angeboten und Rechnungen — Unterlagen fremder Firmen
// (z.B. das Angebots-PDF einer Fensterfirma mit Zeichnungen).
//
// Zwei Wege, pro Anlage wählbar:
//   'anhaengen' → die Seiten werden hinten an das erzeugte PDF angebaut,
//                 unverändert und damit in Originalqualität.
//   'separat'   → die Datei wird der Email als eigene Anlage beigelegt.
//
// Grundsatz: Ohne Anlagen passiert hier NICHTS. Die Funktion gibt dann das
// unveränderte Original zurück — der bestehende Rechnungsweg bleibt Byte für
// Byte derselbe.

import { supabase } from "@/integrations/supabase/client";

export const ANLAGEN_BUCKET = "invoice-attachments";

export type AnlagenModus = "anhaengen" | "separat";

export interface InvoiceAttachment {
  id: string;
  invoice_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  modus: string;
  seiten: number | null;
  sort_order: number;
  created_at?: string;
}

/** Ergebnis des Zusammenbaus — der Aufrufer soll Fehler zeigen können. */
export interface ZusammenbauErgebnis {
  blob: Blob;
  /** Wie viele Anlagen tatsächlich eingebaut wurden. */
  angehaengt: number;
  /** Anlagen, die nicht eingebaut werden konnten (Dateiname + Grund). */
  fehler: string[];
}

/**
 * Grenzen für den Mailversand. Der Versanddienst rechnet in base64, das ist
 * rund ein Drittel mehr als die reine Dateigröße — deshalb liegt die harte
 * Grenze bei 22 MB echten Daten (≈30 MB base64, die Prüfung in
 * send-document-email). Ab 15 MB wird gewarnt, weil viele Postfächer schon
 * darunter abweisen.
 */
export const MAIL_GROESSE_WARNUNG = 15 * 1024 * 1024;
export const MAIL_GROESSE_MAXIMUM = 22 * 1024 * 1024;

export function istPdf(mimeType?: string | null, dateiname?: string | null): boolean {
  if ((mimeType || "").toLowerCase().includes("pdf")) return true;
  return (dateiname || "").toLowerCase().endsWith(".pdf");
}

/**
 * Nur JPG und PNG — bewusst NICHT jedes image/*. Ein iPhone liefert HEIC,
 * und HEIC/WEBP/GIF lassen sich nicht in ein PDF einbetten. Würden sie hier
 * durchgehen, scheiterten sie erst beim Zusammenbau des fertigen Angebots.
 */
export function istBild(mimeType?: string | null, dateiname?: string | null): boolean {
  const typ = (mimeType || "").toLowerCase();
  if (typ === "image/jpeg" || typ === "image/jpg" || typ === "image/png") return true;
  // Sonst über die Endung. Das deckt auch ältere Typangaben wie
  // "image/x-png" ab, die Windows für ganz normale PNG-Dateien meldet.
  // HEIC, WEBP und GIF fallen hier ohnehin durch — sie haben andere Endungen.
  return /\.(jpe?g|png)$/i.test(dateiname || "");
}

/** Nur was hinten ans PDF gebaut wird, in der vom Benutzer gesetzten Reihenfolge. */
export function zumAnhaengen(anlagen: InvoiceAttachment[]): InvoiceAttachment[] {
  return anlagen
    .filter(a => (a.modus || "").trim() !== "separat")
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Nur was der Email separat beigelegt wird. */
export function zumBeilegen(anlagen: InvoiceAttachment[]): InvoiceAttachment[] {
  return anlagen
    .filter(a => (a.modus || "").trim() === "separat")
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Lesbare Dateigröße für die Anzeige. */
export function formatGroesse(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Anlagen einer Rechnung laden. Fehler werden geworfen, nicht verschluckt. */
export async function ladeAnlagen(invoiceId: string): Promise<InvoiceAttachment[]> {
  const { data, error } = await supabase
    .from("invoice_attachments" as never)
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");
  if (error) throw error;
  return (data as unknown as InvoiceAttachment[]) || [];
}

async function ladeDatei(filePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(ANLAGEN_BUCKET).download(filePath);
  if (error || !data) throw new Error(error?.message || "Datei nicht gefunden");
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Übersetzt die englischen Meldungen der PDF-Bibliothek in etwas, mit dem
 * ein Anwender etwas anfangen kann.
 */
export function verstaendlicherFehler(fehler: unknown, dateiname: string): string {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  if (/encrypt/i.test(text)) {
    return `${dateiname}: Die Datei ist kopiergeschützt und lässt sich nicht einbauen — bitte auf „Separat" stellen, dann geht sie als eigene Anlage mit.`;
  }
  // An den tatsächlichen Wortlauten der Bibliothek verankert, damit nicht
  // jede Meldung mit "png" darin fälschlich als Bildfehler gilt.
  if (/SOI not found|Unable to embed|Invalid PNG|not a PNG|not a JPEG/i.test(text)) {
    return `${dateiname}: Bild nicht lesbar — nur JPG und PNG können eingebaut werden.`;
  }
  if (/Failed to parse|DataView|Unexpected|offset/i.test(text)) {
    return `${dateiname}: Die Datei ist beschädigt oder unvollständig.`;
  }
  if (/not found|nicht gefunden/i.test(text)) {
    return `${dateiname}: Die Datei wurde nicht gefunden.`;
  }
  return `${dateiname}: ${text}`;
}

/**
 * Liest Seitenzahl und Kopierschutz eines PDFs in einem Durchgang.
 *
 * Kopiergeschützte Dateien lassen sich NICHT einbauen: die Bibliothek kann
 * sie nicht entschlüsseln und würde unlesbare Seiten erzeugen. Sie gehören
 * als eigene Anlage an die Email.
 *
 * `seiten` ist null, wenn die Datei nicht gelesen werden konnte — das ist
 * kein Fehler, sondern nur eine fehlende Anzeigeinformation.
 */
export async function pdfInfo(bytes: Uint8Array): Promise<{ seiten: number | null; geschuetzt: boolean }> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    return { seiten: doc.getPageCount(), geschuetzt: false };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    return { seiten: null, geschuetzt: /encrypt/i.test(text) };
  }
}

/**
 * Baut die Anlagen mit modus='anhaengen' hinten an das erzeugte PDF an.
 *
 * PDF-Anlagen werden Seite für Seite unverändert übernommen (keine
 * Umwandlung in Bilder — Maßzeichnungen bleiben scharf und der Text
 * durchsuchbar). Bilder bekommen je eine eigene A4-Seite, eingepasst mit
 * Rand und unter Beibehaltung des Seitenverhältnisses.
 *
 * Eine defekte Anlage lässt den ganzen Vorgang NICHT scheitern: sie wird
 * übersprungen und im Ergebnis gemeldet. Ein Angebot muss auch dann
 * erzeugbar bleiben, wenn eine Fremddatei beschädigt ist.
 */
export async function mitAnlagenZusammenfuegen(
  basisPdf: Blob,
  anlagen: InvoiceAttachment[],
): Promise<ZusammenbauErgebnis> {
  const anzubauen = zumAnhaengen(anlagen);
  // Der Normalfall: keine Anlagen → Original unverändert zurück.
  if (anzubauen.length === 0) {
    return { blob: basisPdf, angehaengt: 0, fehler: [] };
  }

  const { PDFDocument } = await import("pdf-lib");
  const fehler: string[] = [];
  let angehaengt = 0;

  const ziel = await PDFDocument.load(await basisPdf.arrayBuffer());

  for (const anlage of anzubauen) {
    try {
      const bytes = await ladeDatei(anlage.file_path);

      if (istPdf(anlage.mime_type, anlage.file_name)) {
        // BEWUSST ohne ignoreEncryption: die Bibliothek kann kopiergeschützte
        // PDFs nicht entschlüsseln. Mit der Option würden die verschlüsselten
        // Seiten unverändert übernommen und wären beim Kunden unlesbar —
        // während die App vollen Erfolg meldet. Lieber ein klarer Fehler.
        const quelle = await PDFDocument.load(bytes);
        const seitenIndizes = quelle.getPageIndices();
        if (seitenIndizes.length === 0) {
          fehler.push(`${anlage.file_name}: Die Datei enthält keine Seiten.`);
          continue;
        }
        const seiten = await ziel.copyPages(quelle, seitenIndizes);
        seiten.forEach(seite => ziel.addPage(seite));
        angehaengt++;
      } else if (istBild(anlage.mime_type, anlage.file_name)) {
        const istPng = /^\x89PNG/.test(String.fromCharCode(...bytes.slice(0, 4)));
        const bild = istPng ? await ziel.embedPng(bytes) : await ziel.embedJpg(bytes);
        // A4 hochkant in Punkten
        const seite = ziel.addPage([595.28, 841.89]);
        const rand = 40;
        const maxB = 595.28 - rand * 2;
        const maxH = 841.89 - rand * 2;
        const faktor = Math.min(maxB / bild.width, maxH / bild.height, 1);
        const b = bild.width * faktor;
        const h = bild.height * faktor;
        seite.drawImage(bild, {
          x: (595.28 - b) / 2,
          y: (841.89 - h) / 2,
          width: b,
          height: h,
        });
        angehaengt++;
      } else {
        fehler.push(`${anlage.file_name}: nur PDF, JPG und PNG können eingebaut werden`);
      }
    } catch (err) {
      fehler.push(verstaendlicherFehler(err, anlage.file_name));
    }
  }

  if (angehaengt === 0) {
    // Nichts eingebaut → Original zurückgeben, damit das Angebot trotzdem
    // erzeugt wird. Die Gründe stehen in `fehler`.
    return { blob: basisPdf, angehaengt: 0, fehler };
  }

  try {
    // save() liefert ein frisches Uint8Array; der Blob-Konstruktor kopiert
    // ohnehin. Eine zusätzliche Kopie würde bei großen Anlagen nur den
    // Speicherbedarf verdoppeln — auf dem Tablet auf der Baustelle spürbar.
    const ergebnis = await ziel.save();
    return {
      blob: new Blob([ergebnis], { type: "application/pdf" }),
      angehaengt,
      fehler,
    };
  } catch (err) {
    // Auch das Zusammenschreiben kann scheitern (Speicher, defekte Quelle).
    // Dann geht das Original raus — mit deutlichem Hinweis, dass die
    // Anlagen fehlen.
    return {
      blob: basisPdf,
      angehaengt: 0,
      fehler: [...fehler, `Die Anlagen konnten nicht eingebaut werden: ${(err as Error).message}`],
    };
  }
}

/**
 * Bequemer Aufruf für die Stellen, die nur eine invoiceId haben.
 * Lädt die Anlagen selbst und gibt bei fehlender ID oder Ladefehler das
 * unveränderte Original zurück — ein Ladeproblem darf das Erzeugen eines
 * Angebots nie verhindern.
 */
export async function pdfMitAnlagen(
  basisPdf: Blob,
  invoiceId: string | null | undefined,
): Promise<ZusammenbauErgebnis> {
  if (!invoiceId) return { blob: basisPdf, angehaengt: 0, fehler: [] };
  try {
    const anlagen = await ladeAnlagen(invoiceId);
    return await mitAnlagenZusammenfuegen(basisPdf, anlagen);
  } catch (err) {
    return { blob: basisPdf, angehaengt: 0, fehler: [(err as Error).message] };
  }
}

/** Dateiname für den Storage: Sonderzeichen raus, Endung erhalten. */
export function sichererDateiname(name: string): string {
  const sauber = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sauber || `anlage_${Date.now()}.pdf`;
}
