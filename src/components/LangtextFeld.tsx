// Langtext einer Angebots-/Rechnungsposition.
//
// Zwei Zustände, damit der schnelle Weg schnell bleibt:
//   • unformatierter Text  → gewohntes Eingabefeld, direkt lostippen
//   • formatierter Text    → Vorschau, Bearbeiten im Dialog mit Editor
// Über den Stift-Knopf lässt sich jederzeit auf Formatierung umschalten.
//
// Die Vorschau rendert die Abschnitte als React-Elemente statt per
// dangerouslySetInnerHTML — dadurch kann aus dem gespeicherten Text kein
// Markup in die Seite gelangen, und man sieht genau das, was ins PDF kommt.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Type } from "lucide-react";
import { istFormatiert, enthaeltAuszeichnung, htmlZuAbschnitte, textZuHtml, alsText, normalisiere } from "@/lib/richText";

interface Props {
  wert: string;
  onChange: (wert: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Zeigt formatierten Text so an, wie er im PDF erscheint. */
export function FormatierteVorschau({ inhalt, className }: { inhalt: string; className?: string }) {
  const abschnitte = htmlZuAbschnitte(inhalt);
  return (
    <span className={className}>
      {abschnitte.map((a, i) =>
        a.text === "\n" ? (
          <br key={i} />
        ) : (
          <span
            key={i}
            style={{
              fontWeight: a.fett ? 600 : undefined,
              fontStyle: a.kursiv ? "italic" : undefined,
              textDecoration: a.unterstrichen ? "underline" : undefined,
              color: a.farbe || undefined,
            }}
          >
            {a.text}
          </span>
        )
      )}
    </span>
  );
}

export function LangtextFeld({ wert, onChange, disabled, placeholder }: Props) {
  const [dialogOffen, setDialogOffen] = useState(false);
  const [entwurf, setEntwurf] = useState("");
  // Nur echte Auszeichnung (fett/kursiv/farbig/Liste) erzwingt die Vorschau.
  // Reine Absätze aus dem Editor bleiben direkt tippbar.
  const formatiert = enthaeltAuszeichnung(wert);
  // Was im einfachen Feld steht: bei bloßen Absätzen der reine Text.
  const anzeigeText = istFormatiert(wert) ? alsText(wert) : (wert || "");

  const oeffnen = () => {
    // Alten Klartext für den Editor umwandeln, damit Umbrüche erhalten bleiben.
    setEntwurf(istFormatiert(wert) ? wert : textZuHtml(wert));
    setDialogOffen(true);
  };

  const uebernehmen = () => {
    // Hat der Bearbeiter alle Formatierung wieder entfernt, speichern wir
    // reinen Text zurück — sonst schleppt jede Position leeres Markup mit.
    const nurText = alsText(entwurf);
    const enthaeltFormatierung = /<(strong|b|em|i|u|span|li)\b/i.test(entwurf);
    onChange(enthaeltFormatierung ? normalisiere(entwurf) : nurText);
    setDialogOffen(false);
  };

  return (
    <>
      <div className="relative mt-1">
        {formatiert ? (
          <button
            type="button"
            disabled={disabled}
            onClick={oeffnen}
            className={`w-full text-left text-xs border rounded px-2 py-1 bg-muted/30 min-h-[28px] ${
              disabled ? "opacity-60 cursor-default" : "hover:bg-muted/50 transition-colors"
            }`}
            title={disabled ? undefined : "Langtext bearbeiten"}
          >
            <FormatierteVorschau inhalt={wert} />
          </button>
        ) : (
          <textarea
            // Ohne Auszeichnung zeigen wir den reinen Text — sonst stünden
            // die Absatz-Tags des Editors sichtbar im Feld. Beim Tippen wird
            // Klartext gespeichert; verloren geht dabei nichts, weil in
            // diesem Zweig keine Formatierung vorhanden ist.
            value={anzeigeText}
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            placeholder={placeholder}
            className="w-full text-xs border rounded px-2 py-1 pr-7 resize-none bg-muted/30"
            style={{ minHeight: "28px", height: anzeigeText ? "auto" : "28px" }}
            rows={anzeigeText ? Math.max(2, anzeigeText.split("\n").length) : 1}
          />
        )}
        {!disabled && !formatiert && (
          <button
            type="button"
            onClick={oeffnen}
            title="Fett, kursiv, farbig formatieren"
            className="absolute top-1 right-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Type className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Dialog open={dialogOffen} onOpenChange={(o) => !o && setDialogOffen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Langtext formatieren</DialogTitle>
          </DialogHeader>
          <RichTextEditor
            variante="langtext"
            value={entwurf}
            onChange={setEntwurf}
            rows={8}
            placeholder="Details zur Position — fett, kursiv, unterstrichen und Farbe erscheinen genauso im PDF."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
            <Button onClick={uebernehmen}>Übernehmen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
