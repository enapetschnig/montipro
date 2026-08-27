// Formatierter Text (fett, kursiv, unterstrichen, farbig) für Material-
// Langtexte und Positions-Langtexte.
//
// Gespeichert wird das HTML, das der Editor liefert. Das PDF wird aber nicht
// aus HTML erzeugt, sondern Zeichen für Zeichen gezeichnet — deshalb zerlegt
// dieses Modul das HTML in Abschnitte mit Formatierung und bricht sie in
// Zeilen um. Für Listen, Suche und Excel gibt `alsText` den reinen Text.
//
// Bewusst ohne DOMParser: so läuft und testet es sich auch außerhalb des
// Browsers, und der Editor (Quill) erzeugt ohnehin sehr einfaches HTML.

export interface TextAbschnitt {
  text: string;
  fett?: boolean;
  kursiv?: boolean;
  unterstrichen?: boolean;
  /** Hex-Farbe wie "#e60000", oder undefined für die Standardfarbe. */
  farbe?: string;
}

export type TextZeile = TextAbschnitt[];

const ENTITIES: Record<string, string> = {
  "&nbsp;": "\u00a0",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function entitiesAufloesen(text: string): string {
  return text
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, m => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Enthält der gespeicherte Text Formatierung? Alte Langtexte sind reiner
 * Text mit Zeilenumbrüchen und müssen unverändert weiterlaufen.
 *
 * Verlangt ein Block-Tag oder ein schließendes Tag — der Editor setzt immer
 * beides. Sonst würde ein Maßtext wie "U-Profil <b 50> verzinkt" als HTML
 * gelten und beim Anzeigen verstümmelt.
 */
export function istFormatiert(text?: string | null): boolean {
  if (!text) return false;
  const attribute = String.raw`(?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*\s*\/?`;
  return new RegExp(`<(p|div|br|li|ul|ol|h[1-6])${attribute}>`, "i").test(text)
    || /<\/(p|div|li|ul|ol|h[1-6]|strong|b|em|i|u|span)\s*>/i.test(text);
}

/**
 * Trägt der Text sichtbare Auszeichnung — also mehr als bloße Absätze?
 * Entscheidet, ob die Eingabe als schnelles Textfeld oder als Vorschau
 * mit Editor angeboten wird.
 */
export function enthaeltAuszeichnung(text?: string | null): boolean {
  if (!istFormatiert(text)) return false;
  return /<(strong|b|em|i|u|span|li)(\s[^>]*)?>/i.test(text || "");
}

/**
 * Leeres Editor-Ergebnis erkennen. Der Editor hinterlässt beim bloßen
 * Hineinklicken "<p><br></p>" — gespeichert würde daraus im PDF eine
 * leere Zeile mit reserviertem Platz.
 */
export function istLeer(text?: string | null): boolean {
  return alsText(text).trim() === "";
}

/** Leeres Markup zu einem leeren Text machen, sonst unverändert lassen. */
export function normalisiere(text?: string | null): string {
  if (!text) return "";
  return istLeer(text) ? "" : text;
}

/**
 * Reiner Text ohne Formatierung — für Listen, Suche, Excel und überall
 * dort, wo sonst rohe Tags sichtbar würden.
 */
export function alsText(inhalt?: string | null): string {
  if (!inhalt) return "";
  if (!istFormatiert(inhalt)) return inhalt;
  const mitUmbruechen = inhalt
    // Blockenden und <br> werden zu Zeilenumbrüchen.
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Aufzählungspunkte kenntlich machen.
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  return entitiesAufloesen(mitUmbruechen)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    // Bewusst kein trim(): das würde auch geschützte Leerzeichen entfernen
    // und damit die Einrückung alter, mit Leerzeichen gesetzter Langtexte.
    .replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Reiner Text → HTML, damit alte Langtexte im Editor korrekt erscheinen. */
export function textZuHtml(text?: string | null): string {
  if (!text) return "";
  if (istFormatiert(text)) return text;
  const geschuetzt = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return geschuetzt
    // Folgen von Leerzeichen als geschützte Leerzeichen ablegen: HTML würde
    // sie sonst auf eines zusammenfalten und mit Leerzeichen ausgerichtete
    // Spalten in alten Langtexten zerstören.
    .replace(/ {2,}/g, treffer => "&nbsp;".repeat(treffer.length))
    .split(/\r?\n/)
    .map(zeile => `<p>${zeile === "" ? "<br>" : zeile}</p>`)
    .join("");
}

/** "rgb(230, 0, 0)" oder "#e60000" → "#e60000". */
function farbeNormalisieren(wert: string): string | undefined {
  const roh = wert.trim().toLowerCase();
  const rgb = roh.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }
  const kurz = roh.match(/^#([0-9a-f]{3})$/);
  if (kurz) {
    const [r, g, b] = kurz[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const lang = roh.match(/^#([0-9a-f]{6})$/);
  if (lang) return `#${lang[1]}`;
  return undefined;
}

/** Farbe aus einem style-Attribut lesen (Hintergrundfarbe wird ignoriert). */
function farbeAusStyle(attribute: string): string | undefined {
  const treffer = attribute.match(/(?:^|[;"'\s])color\s*:\s*([^;"']+)/i);
  return treffer ? farbeNormalisieren(treffer[1]) : undefined;
}

/** Schwarz muss nicht gesetzt werden — spart Zustandswechsel im PDF. */
function istSchwarz(farbe?: string): boolean {
  return farbe === "#000000";
}

/**
 * HTML → Abschnitte. Ein Abschnitt mit text "\n" steht für einen
 * Zeilenumbruch. Unbekannte Tags werden übersprungen, ihr Inhalt bleibt
 * erhalten — kaputtes HTML führt nie zu Datenverlust.
 */
export function htmlZuAbschnitte(html?: string | null): TextAbschnitt[] {
  if (!html) return [];
  if (!istFormatiert(html)) {
    // Alter Klartext: nur an Zeilenumbrüchen trennen.
    const abschnitte: TextAbschnitt[] = [];
    html.split(/\r?\n/).forEach((zeile, i) => {
      if (i > 0) abschnitte.push({ text: "\n" });
      if (zeile) abschnitte.push({ text: zeile });
    });
    return abschnitte;
  }

  const abschnitte: TextAbschnitt[] = [];
  const stapel: TextAbschnitt[] = [{ text: "" }];
  let letzterWarBlock = true;

  const aktuell = (): TextAbschnitt => stapel[stapel.length - 1];
  const umbruch = () => abschnitte.push({ text: "\n" });
  // Hatte der aktuelle Block schon Inhalt? Der Editor füllt eine LEERE Zeile
  // mit "<p><br></p>" — dieses <br> ist Füllzeichen, kein Umbruch. Zählte man
  // beides, entstünde aus einer Leerzeile im PDF eine doppelte.
  let blockHatInhalt = false;

  const tagRegex = /<\/?([a-z0-9]+)((?:\s+[^>]*)?)\/?>/gi;
  let position = 0;
  let treffer: RegExpExecArray | null;

  const textAnfuegen = (roh: string) => {
    // Nur echte Leerräume falten — das geschützte Leerzeichen (\u00a0)
    // bleibt stehen, damit mit Leerzeichen gesetzte Spalten überleben.
    const text = entitiesAufloesen(roh).replace(/[ \t\r\n]+/g, " ");
    if (!text) return;
    // Führendes Leerzeichen direkt nach einem Blockwechsel verwerfen.
    const sauber = letzterWarBlock ? text.replace(/^ /, "") : text;
    if (!sauber) return;
    letzterWarBlock = false;
    blockHatInhalt = true;
    const stil = aktuell();
    abschnitte.push({ ...stil, text: sauber });
  };

  while ((treffer = tagRegex.exec(html)) !== null) {
    textAnfuegen(html.slice(position, treffer.index));
    position = tagRegex.lastIndex;

    const istEnde = treffer[0].startsWith("</");
    const tag = treffer[1].toLowerCase();
    const attribute = treffer[2] || "";

    if (tag === "br") {
      if (blockHatInhalt) {
        umbruch();
        blockHatInhalt = false;
      }
      letzterWarBlock = true;
      continue;
    }

    if (["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      if (istEnde) {
        umbruch();
        blockHatInhalt = false;
        letzterWarBlock = true;
      } else {
        blockHatInhalt = false;
        if (tag === "li") {
          abschnitte.push({ ...aktuell(), text: "• " });
          blockHatInhalt = true;
          letzterWarBlock = false;
        }
        // Überschriften im Langtext einfach fett setzen.
        if (/^h[1-6]$/.test(tag)) stapel.push({ ...aktuell(), fett: true });
      }
      if (istEnde && /^h[1-6]$/.test(tag) && stapel.length > 1) stapel.pop();
      continue;
    }

    if (["strong", "b", "em", "i", "u", "span", "font"].includes(tag)) {
      if (istEnde) {
        if (stapel.length > 1) stapel.pop();
      } else {
        const neu: TextAbschnitt = { ...aktuell() };
        if (tag === "strong" || tag === "b") neu.fett = true;
        if (tag === "em" || tag === "i") neu.kursiv = true;
        if (tag === "u") neu.unterstrichen = true;
        const farbe = farbeAusStyle(attribute);
        if (farbe && !istSchwarz(farbe)) neu.farbe = farbe;
        stapel.push(neu);
      }
      continue;
    }
    // ol/ul und alles Unbekannte: Tag ignorieren, Inhalt behalten.
  }
  textAnfuegen(html.slice(position));

  // Genau einen abschließenden Umbruch entfernen: den, den das letzte
  // </p> erzeugt hat. Weitere gehören zu bewusst gesetzten Leerzeilen.
  if (abschnitte.length > 0 && abschnitte[abschnitte.length - 1].text === "\n") {
    abschnitte.pop();
  }
  return abschnitte;
}

function gleicherStil(a: TextAbschnitt, b: TextAbschnitt): boolean {
  return !!a.fett === !!b.fett
    && !!a.kursiv === !!b.kursiv
    && !!a.unterstrichen === !!b.unterstrichen
    && (a.farbe || "") === (b.farbe || "");
}

/**
 * Bricht die Abschnitte auf eine Breite um. `messen` liefert die Breite
 * eines Textes im jeweiligen Stil — dadurch bleibt dieses Modul unabhängig
 * von der PDF-Bibliothek und ist ohne sie testbar.
 */
export function umbrecheAbschnitte(
  abschnitte: TextAbschnitt[],
  maxBreite: number,
  messen: (text: string, stil: TextAbschnitt) => number,
): TextZeile[] {
  const zeilen: TextZeile[] = [];
  let zeile: TextZeile = [];
  let breite = 0;

  const zeileAbschliessen = () => {
    zeilen.push(zeile);
    zeile = [];
    breite = 0;
  };

  const anfuegen = (text: string, stil: TextAbschnitt, textBreite: number) => {
    const letzter = zeile[zeile.length - 1];
    if (letzter && gleicherStil(letzter, stil)) letzter.text += text;
    else zeile.push({ ...stil, text });
    breite += textBreite;
  };

  // Merken, ob zuletzt ein Umbruch kam: dann gehört am Ende noch eine
  // (leere) Zeile dazu. Ein Langtext, der auf Enter endet, hatte bisher
  // ebenfalls eine Leerzeile — sonst würde die Position plötzlich kürzer.
  let letzterWarUmbruch = false;

  for (const abschnitt of abschnitte) {
    if (abschnitt.text === "\n") {
      zeileAbschliessen();
      letzterWarUmbruch = true;
      continue;
    }
    letzterWarUmbruch = false;
    // An echten Leerräumen trennen, die Trenner behalten. Geschützte
    // Leerzeichen bleiben Teil des Wortes und brechen dort nicht um.
    const teile = abschnitt.text.split(/([ \t\r\n]+)/).filter(t => t !== "");
    for (const teil of teile) {
      const istLeerraum = /^[ \t\r\n]+$/.test(teil);
      const teilBreite = messen(teil, abschnitt);

      if (breite + teilBreite > maxBreite && breite > 0) {
        zeileAbschliessen();
        // Ein Leerzeichen am Zeilenumbruch fällt weg.
        if (istLeerraum) continue;
      }

      // Einzelwort breiter als die Spalte (lange Artikelnummer, URL):
      // zeichenweise trennen, sonst läuft es über den Rand hinaus.
      if (teilBreite > maxBreite && !istLeerraum) {
        let rest = teil;
        while (rest.length > 0) {
          let passt = "";
          for (const zeichen of rest) {
            const versuch = passt + zeichen;
            if (breite + messen(versuch, abschnitt) > maxBreite && passt.length > 0) break;
            passt = versuch;
          }
          if (!passt) passt = rest[0];
          anfuegen(passt, abschnitt, messen(passt, abschnitt));
          rest = rest.slice(passt.length);
          if (rest.length > 0) zeileAbschliessen();
        }
        continue;
      }

      anfuegen(teil, abschnitt, teilBreite);
    }
  }

  if (zeile.length > 0 || letzterWarUmbruch || zeilen.length === 0) zeileAbschliessen();
  return zeilen;
}

/** "#e60000" → [230, 0, 0], für die PDF-Bibliothek. */
export function hexZuRgb(farbe?: string): [number, number, number] | undefined {
  if (!farbe) return undefined;
  const treffer = farbe.match(/^#([0-9a-f]{6})$/i);
  if (!treffer) return undefined;
  const zahl = parseInt(treffer[1], 16);
  return [(zahl >> 16) & 255, (zahl >> 8) & 255, zahl & 255];
}
