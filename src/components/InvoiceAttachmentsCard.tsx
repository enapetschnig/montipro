// Anlagen zu einem Angebot / einer Rechnung: Unterlagen fremder Firmen
// hochladen und festlegen, ob sie hinten ans PDF gebaut oder der Email
// separat beigelegt werden.
import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Paperclip, Upload, Trash2, FileText, Image as ImageIcon, ExternalLink,
  ArrowUp, ArrowDown, Loader2, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ANLAGEN_BUCKET, ladeAnlagen, formatGroesse, sichererDateiname,
  istPdf, istBild, zumAnhaengen, zumBeilegen, pdfInfo,
  MAIL_GROESSE_WARNUNG, MAIL_GROESSE_MAXIMUM,
  type InvoiceAttachment,
} from "@/lib/invoiceAttachments";

interface Props {
  invoiceId: string | null;
  /** Gesperrte Belege (storniert/bezahlt) nur noch ansehen. */
  disabled?: boolean;
  /** Meldet Änderungen nach oben, damit die Seite ihren Stand kennt. */
  onChanged?: (anlagen: InvoiceAttachment[]) => void;
}

const MAX_DATEI = 50 * 1024 * 1024;

export function InvoiceAttachmentsCard({ invoiceId, disabled, onChanged }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [anlagen, setAnlagen] = useState<InvoiceAttachment[]>([]);
  const [laden, setLaden] = useState(false);
  const [hochladen, setHochladen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const laden_ = useCallback(async () => {
    if (!invoiceId) { setAnlagen([]); return; }
    setLaden(true);
    try {
      const daten = await ladeAnlagen(invoiceId);
      setAnlagen(daten);
      onChanged?.(daten);
    } catch (err) {
      toast({ variant: "destructive", title: "Anlagen konnten nicht geladen werden", description: (err as Error).message });
    } finally {
      setLaden(false);
    }
    // onChanged/toast bewusst nicht in den Abhängigkeiten: sonst lädt die
    // Karte bei jedem Rendern der Elternseite neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  useEffect(() => { void laden_(); }, [laden_]);

  /**
   * Seitenzahl und Kopierschutz einer Datei ermitteln. Kopiergeschützte PDFs
   * lassen sich nicht ins Dokument einbauen — sie werden gleich beim
   * Hochladen auf „Separat" gestellt, damit der Kunde sie trotzdem bekommt
   * und der Fehler nicht erst beim Versand auffällt.
   */
  const dateiPruefen = async (datei: File): Promise<{ seiten: number | null; geschuetzt: boolean }> => {
    if (!istPdf(datei.type, datei.name)) return { seiten: null, geschuetzt: false };
    return pdfInfo(new Uint8Array(await datei.arrayBuffer()));
  };

  const dateienVerarbeiten = async (liste: FileList | File[]) => {
    if (!invoiceId || disabled) return;
    const dateien = Array.from(liste).filter(f => {
      const ok = istPdf(f.type, f.name) || istBild(f.type, f.name);
      if (!ok) toast({ variant: "destructive", title: "Nicht unterstützt", description: `${f.name}: nur PDF, JPG und PNG` });
      if (ok && f.size > MAX_DATEI) {
        toast({ variant: "destructive", title: "Datei zu groß", description: `${f.name}: maximal 50 MB` });
        return false;
      }
      return ok;
    });
    if (dateien.length === 0) return;

    setHochladen(true);
    let maxSort = anlagen.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0);
    const fehler: string[] = [];
    const geschuetzte: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const datei of dateien) {
        try {
          const { seiten, geschuetzt } = await dateiPruefen(datei);
          if (geschuetzt) geschuetzte.push(datei.name);
          const pfad = `${invoiceId}/${Date.now()}_${sichererDateiname(datei.name)}`;
          const { error: upErr } = await supabase.storage
            .from(ANLAGEN_BUCKET)
            .upload(pfad, datei, { upsert: false, contentType: datei.type || undefined });
          if (upErr) throw new Error(upErr.message);

          maxSort += 1;
          const { error: dbErr } = await supabase.from("invoice_attachments" as never).insert({
            invoice_id: invoiceId,
            file_path: pfad,
            file_name: datei.name,
            mime_type: datei.type || null,
            file_size: datei.size,
            // Kopiergeschützte PDFs können nicht eingebaut werden — gleich
            // richtig einsortieren statt den Fehler auf später zu vertagen.
            modus: geschuetzt ? "separat" : "anhaengen",
            seiten,
            sort_order: maxSort,
            created_by: user?.id ?? null,
          } as never);
          if (dbErr) {
            // Verwaiste Datei wieder entfernen, sonst liegt sie ohne
            // Eintrag im Speicher und taucht nie wieder auf.
            await supabase.storage.from(ANLAGEN_BUCKET).remove([pfad]);
            throw new Error(dbErr.message);
          }
        } catch (err) {
          fehler.push(`${datei.name}: ${(err as Error).message}`);
        }
      }

      if (fehler.length > 0) {
        toast({ variant: "destructive", title: "Nicht alle Anlagen übernommen", description: fehler.join(" · ") });
      } else {
        toast({ title: dateien.length === 1 ? "Anlage hinzugefügt" : `${dateien.length} Anlagen hinzugefügt` });
      }
      if (geschuetzte.length > 0) {
        toast({
          title: geschuetzte.length === 1 ? "Kopiergeschützte Datei" : "Kopiergeschützte Dateien",
          description: `${geschuetzte.join(", ")} — lässt sich nicht ins Dokument einbauen und wird deshalb als eigene Anlage mitgeschickt.`,
        });
      }
      await laden_();
    } finally {
      setHochladen(false);
    }
  };

  const modusUmschalten = async (anlage: InvoiceAttachment, modus: string) => {
    if (disabled || anlage.modus === modus) return;
    const { error } = await supabase
      .from("invoice_attachments" as never)
      .update({ modus } as never)
      .eq("id", anlage.id);
    if (error) {
      toast({ variant: "destructive", title: "Nicht geändert", description: error.message });
      return;
    }
    await laden_();
  };

  const verschieben = async (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (disabled || ziel < 0 || ziel >= anlagen.length) return;
    const a = anlagen[index];
    const b = anlagen[ziel];
    // Beide Positionen tauschen und normalisiert zurückschreiben.
    const neu = [...anlagen];
    neu[index] = b;
    neu[ziel] = a;
    setAnlagen(neu);
    const fehler: string[] = [];
    for (let i = 0; i < neu.length; i++) {
      const { error } = await supabase
        .from("invoice_attachments" as never)
        .update({ sort_order: i + 1 } as never)
        .eq("id", neu[i].id);
      if (error) fehler.push(error.message);
    }
    if (fehler.length > 0) {
      toast({ variant: "destructive", title: "Reihenfolge nicht gespeichert", description: fehler[0] });
    }
    await laden_();
  };

  const oeffnen = async (anlage: InvoiceAttachment) => {
    const { data } = await supabase.storage.from(ANLAGEN_BUCKET).createSignedUrl(anlage.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast({ variant: "destructive", title: "Datei nicht verfügbar" });
  };

  const loeschen = async (anlage: InvoiceAttachment) => {
    if (disabled) return;
    if (!window.confirm(`Anlage „${anlage.file_name}" entfernen?`)) return;
    const { error } = await supabase.from("invoice_attachments" as never).delete().eq("id", anlage.id);
    if (error) {
      toast({ variant: "destructive", title: "Nicht entfernt", description: error.message });
      return;
    }
    // Datei danach löschen: bleibt sie liegen, ist das unschön aber
    // harmlos — ein verwaister DB-Eintrag wäre schlimmer.
    await supabase.storage.from(ANLAGEN_BUCKET).remove([anlage.file_path]);
    toast({ title: "Anlage entfernt" });
    await laden_();
  };

  if (!invoiceId) return null;

  const angehaengte = zumAnhaengen(anlagen);
  const beigelegte = zumBeilegen(anlagen);
  const gesamtGroesse = anlagen.reduce((s, a) => s + (a.file_size || 0), 0);
  const zusatzSeiten = angehaengte.reduce((s, a) => s + (a.seiten || 1), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Anlagen
          {anlagen.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {anlagen.length} {anlagen.length === 1 ? "Datei" : "Dateien"} · {formatGroesse(gesamtGroesse)}
            </span>
          )}
          {laden && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Unterlagen anderer Firmen — etwa das Angebot einer Fensterfirma mit Zeichnungen.
          „Ins Dokument" hängt die Seiten hinten an das erzeugte PDF, „Separat" legt die
          Datei der Email als eigene Anlage bei.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!disabled && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void dateienVerarbeiten(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {hochladen ? (
              <p className="text-sm flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Wird hochgeladen...
              </p>
            ) : (
              <>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-medium">Datei hier ablegen oder klicken</p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG · max. 50 MB je Datei</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void dateienVerarbeiten(e.target.files);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
          </div>
        )}

        {anlagen.length > 0 && (
          <div className="space-y-1.5">
            {anlagen.map((anlage, idx) => {
              const separat = zumBeilegen([anlage]).length > 0;
              return (
                <div key={anlage.id} className="flex items-center gap-2 rounded-md border p-2">
                  {istPdf(anlage.mime_type, anlage.file_name)
                    ? <FileText className="h-4 w-4 shrink-0 text-red-500" />
                    : <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{anlage.file_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatGroesse(anlage.file_size)}
                      {anlage.seiten ? ` · ${anlage.seiten} ${anlage.seiten === 1 ? "Seite" : "Seiten"}` : ""}
                    </div>
                  </div>

                  {/* Modus */}
                  <div className="flex rounded-md border overflow-hidden shrink-0">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => modusUmschalten(anlage, "anhaengen")}
                      className={`px-2 py-1 text-[11px] transition-colors ${
                        !separat ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      Ins Dokument
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => modusUmschalten(anlage, "separat")}
                      className={`px-2 py-1 text-[11px] border-l transition-colors ${
                        separat ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      Separat
                    </button>
                  </div>

                  {!disabled && (
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        onClick={() => verschieben(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 disabled:opacity-25 hover:bg-muted rounded"
                        title="Nach oben"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => verschieben(idx, 1)}
                        disabled={idx === anlagen.length - 1}
                        className="p-0.5 disabled:opacity-25 hover:bg-muted rounded"
                        title="Nach unten"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => oeffnen(anlage)} title="Öffnen">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  {!disabled && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => loeschen(anlage)} title="Entfernen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              {angehaengte.length > 0 && (
                <span>
                  <Badge variant="outline" className="mr-1 text-[10px] py-0">ins Dokument</Badge>
                  {angehaengte.length} {angehaengte.length === 1 ? "Datei" : "Dateien"} · ca. {zusatzSeiten} zusätzliche {zusatzSeiten === 1 ? "Seite" : "Seiten"}
                </span>
              )}
              {beigelegte.length > 0 && (
                <span>
                  <Badge variant="outline" className="mr-1 text-[10px] py-0">separat</Badge>
                  {beigelegte.length} als eigene {beigelegte.length === 1 ? "Anlage" : "Anlagen"} in der Email
                </span>
              )}
            </div>

            {gesamtGroesse > MAIL_GROESSE_WARNUNG && (
              <div className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                gesamtGroesse > MAIL_GROESSE_MAXIMUM
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {gesamtGroesse > MAIL_GROESSE_MAXIMUM ? (
                    <>
                      Die Anlagen sind zusammen {formatGroesse(gesamtGroesse)} groß — <strong>zu viel für den
                      Emailversand</strong>. Bitte einzelne Anlagen entfernen, sonst wird die Email abgelehnt.
                    </>
                  ) : (
                    <>
                      Die Anlagen sind zusammen {formatGroesse(gesamtGroesse)} groß. Große Emails werden von
                      manchen Postfächern abgewiesen — bei Bedarf einzelne Anlagen entfernen oder dem Kunden
                      getrennt schicken.
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
