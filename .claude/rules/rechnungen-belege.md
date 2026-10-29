---
paths:
  - "src/pages/Invoice*.tsx"
  - "src/pages/Invoices.tsx"
  - "src/pages/OfferPackages.tsx"
  - "src/pages/PurchaseInvoices.tsx"
  - "src/pages/EmailLog.tsx"
  - "src/components/SendEmailDialog.tsx"
  - "src/components/PurchaseInvoice*.tsx"
  - "src/lib/invoice*.ts"
  - "src/lib/pdf*.ts"
  - "src/lib/richText.ts"
  - "src/lib/mahnungSettings.ts"
  - "src/lib/purchaseInvoiceAmounts.ts"
  - "supabase/functions/generate-invoice-pdf/**"
  - "supabase/functions/send-document-email/**"
  - "supabase/functions/parse-invoice-document/**"
---
# Rechnungen, Angebote, Gutschriften, PDF – Entscheidungen bei BKS

## Belegkette und Nummern
- Kette: Angebot → Auftragsbestätigung → Anzahlungsrechnung → Schlussrechnung (Anzahlungen werden abgezogen); die
  Schlussrechnung lädt alle Positionen des Original-Angebots (Wünsche April 2026). Belegliste mit eigenem Reiter
  „Auftragsbestätigungen“ zwischen Angebote und Storno (25.06.).
- **Fortlaufende Nummern**, auch wenn ein Angebot gelöscht oder eine Rechnung storniert wird – mit der nächsten Nummer
  weitermachen (Christoph, April 2026). `next_document_number()` zählt nur hoch, mit Sperre
  (Migration `20260502100000_next_document_number_lock.sql`). Nummernkreise nur an einer Stelle (Admin).
  Nummer nur auf ausdrücklichen Wunsch „frei machen“ (Beispiel 24.07.: AR_2026_151 gelöscht, Zähler zurück auf 150 –
  vorher Zahlungen/Mahnungen/Mails/Kinder geprüft).
- Zwei leicht verwechselte Kreise: `gutschrift` (Präfix **GS**, Gutschrift an Kunden in `invoices`, mit Bezug auf eine
  Rechnung, Kundendaten übernommen, Storno setzt alles zurück) und `eingangsgutschrift` (Präfix **LG**,
  Lieferantengutschrift in `purchase_invoices`, live 27.08.). Vor neuem Kreis: `select typ, prefix from number_ranges`.
- Zahlungsziel standardmäßig **„sofort fällig“** für alle Rechnungsarten (Judith Postel 25.06.); bei „sofort“ darf im PDF
  kein „zahlbar innerhalb 14 Tagen“ stehen (`computeZahlungsTage`/`stripTageClosingIfSofort`).
- Rechnungen (Rechnung/Anzahlung/Schluss) bekommen beim Speichern Status „offen“ statt Entwurf; Angebot springt nach
  erfolgreichem Mailversand von „Entwurf“ auf „Offen“ (27.07.).
- Österreichische Pflichtangaben nach UStG §11 (April 2026).

## PDF-Layout (Wünsche Christoph/BKS)
- Schriften/Farben laut BKS-Briefpapier (18.04.): Überschriften Montserrat Extrabold, Text Segoe UI; Dunkelblau #1F3A5F,
  Blau #0077CC, Grün #4CAF50. Logo links oben wie bei der Rechnung, Wasserzeichen „VORSCHAU“ nur in der Vorschau, einmal groß.
- Empfängerblock: **kein „z.Hd. …“** (Christoph: „z.Hd. Günter Zerzawy wieso fügst du das bei dem adressanten bei der pdf“),
  **UID immer bei Firmenkunden**; Firmenname nicht doppelt (11.05.). Betreff unter der grünen Trennlinie.
- „Ihr Ansprechpartner“-Block nur, wenn einer gewählt ist; Werte vom Mitarbeiter übernommen, aber änderbar.
- Formatierter Langtext: jsPDF kann kein HTML → `src/lib/richText.ts` + `src/lib/pdfRichText.ts`; HTML in
  `invoice_templates.langbezeichnung`/`invoice_items.langtext`, `invoice_templates.beschreibung` = Klartext-Spiegel.
  Fallen: „U-Profil <b 50>“ ist kein HTML, `<p><br></p>` nur eine Leerzeile, U+00A0 vor Messen in normales Leerzeichen
  (`fuerPdf`). Regressionsnachweis: dieselbe Rechnung alt/neu als PNG vergleichen.
- Anlagen an Angeboten/Rechnungen (27.08.): **pdf-lib entschlüsselt keine kopiergeschützten PDFs** – `ignoreEncryption`
  nie verwenden, Fehler fangen und Datei separat mitschicken.

## Eingangsrechnungen
- Kategorien selbst pflegbar: `admin_config_options` Kategorie `eingangsrechnung_kategorie` (13 Startwerte, 27.07.);
  deaktivierte Kategorie in bestehenden Belegen weiter anzeigen. Mitarbeiter müssen den Menüpunkt Eingangsrechnungen
  (Hochladen) **am Handy** sehen („Ich muss den Menüpunkt am Handy sehen !!!“, April 2026).
- KI-Scan hatte mehrfach falschen Brutto-Betrag – Beträge nach dem Lesen nachrechnen (`purchaseInvoiceAmounts.ts`).
