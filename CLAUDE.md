# Kundenakte: BKS BauKomplettService (App monti.pro)

Kurzfassung für jede KI; die ausführliche Bestandsbeschreibung folgt unten im Wortlaut. `AGENTS.md` ist eine exakte
Kopie dieser Datei (für Codex) – bei Änderungen beide gleich halten. Es gibt kein `JOURNAL.md`; Verlauf steht in
`git log` (Commit-Texte sind ausführlich).

## Wer ist der Kunde
- **BKS BauKomplettService** („Wir machen es komplett“), Bau-Komplettservice; gemeinsamer Standort Wiener Neustädter
  Straße 1, 2542 Kottingbrunn (Niederösterreich). Ausführende Firmen am selben Standort (`src/lib/executingCompanies.ts`):
  Monti.pro, Fensterwerk, Gartenmacher, BKS-BauKomplettService – wählbar je Beleg (`invoices.ausfuehrende_firma`).
- Entstanden als Umbau der App „Fliesentilger“ zu MONTI.PRO (April 2026); Logo/Briefpapier BKS seit 18.04.2026.

## Personen
- **Judith Postel** – schickt Änderungswünsche per Mail (z. B. 25.06.2026, über Christoph weitergeleitet); hat selbst ein Zeitkonto in der App.
- **Günter Zerzawy** – Mitarbeiter/Ansprechpartner im Beleg („Ihr Ansprechpartner“), bekommt WhatsApp-Erinnerungen.
- **Gerhard Stidl** – Mitarbeiterkonto mit Eintritt 1999 (wichtig für Saldo-Rechnungen); Melder der Testmeldung zur Cockpit-Anbindung (31.08.2026).
- Christoph Napetschnig (epower) baut die App und leitet Kundenmails weiter. Antworten an den Kunden **kurz und bündig,
  einfache Sprache, ehrlich** („Sei ehrlich. Wenn etwas teilweise funktioniert, schreib das. Nicht überverkaufen.“).

## Rollen
Administrator, Vorarbeiter, Mitarbeiter (`app_role`), dazu freie Mitarbeiter mit einfachem Stundenformular (`/freelancer`).
Jeder Mitarbeiter sieht alle Projekte. Neue Benutzer warten auf Freischaltung durch den Admin.

## Fachbegriffe
Ersttermin (Erstaufnahme beim Kunden), Besprechungsprotokoll, Bautagesbericht, Regiebericht (`Disturbances`), Plantafel,
Geschäftsbereich (= Google-Kalender), Auftragsbestätigung (AB), Anzahlungs-/Schlussrechnung (AR/SR), Gutschrift (GS),
Lieferantengutschrift (LG), Zeitausgleich (ZA), Zeitkonto, Fremdfirma/Subfirma, Arbeitsleistungen (getrennt von Materialien).

## Feste Regeln / No-Gos
- Belegnummern **fortlaufend**, nie zurückdrehen – außer Christoph verlangt es ausdrücklich für einen bestimmten Beleg.
- Judith Postels Zeitkonto (−12 h) **nicht korrigieren** ohne neue Freigabe (Christoph 24.07.2026).
- Warnungen/Testmails an Christoph (napetschnig.chris@gmail.com), nicht an Kundenadressen.
- „Alles bestehende muss weiter funktionieren und auf Anhieb funktionieren, bevor du pusht“ (Christoph, 30.04.2026) –
  nach jeder Änderung `npm run check`, `npm test`, `npm run build`.
- Schlüssel/Tokens nie in Doku oder Code (Whapi, Resend, Supabase liegen als Secrets).
- Nach Deploy kann der PWA-Cache die alte Version zeigen („ah jetzt funktionierts“ nach Neuladen, 24.07.) – vor
  Fehlersuche an Neuladen denken.

## Technik (Ergänzung zu unten)
| | |
|---|---|
| Live | https://monti.handwerkapp.at (Vercel, Deploy bei Push auf `main`; kein `vercel.json`) |
| Repo | github.com/enapetschnig/montipro |
| Supabase | `zbxizeirecoipqvxymdx` in Org `epadfagtwxodsshrktno` – eigenes Konto, Token aus dem Gmail-Konto gibt 403 |
| Migrationen | SQL über Management-API `POST /v1/projects/zbxizeirecoipqvxymdx/database/query` (Trockenlauf `BEGIN…ROLLBACK` möglich) oder `supabase db push` |
| Mail | Resend, verifizierte Domain chrisnapetschnig.at, Reply-To = Admin-Mail |
| Änderungswünsche | „Änderung melden“ in der App → ePower-Cockpit (`crm.app_wuensche`, app_key `monti.pro`, Function `wunsch-datei`) |

## Wissen nach Thema
| Thema | Datei | Wann lesen |
|---|---|---|
| Rechnungen, Angebote, Gutschriften, Nummern, PDF, Eingangsrechnungen | `.claude/rules/rechnungen-belege.md` | Arbeit an Belegen, PDF-Layout, Mailversand, Eingangsrechnungen |
| Zeiterfassung, Soll, ZA, Zeitkonto | `.claude/rules/zeiterfassung-zeitkonto.md` | Zeiterfassung, Meine Stunden, Stundenauswertung, Freelancer |
| WhatsApp-Bot | `.claude/rules/whatsapp.md` | alles mit Whapi, Erinnerungen, Kanal-Überwachung |
| Plantafel und Google-Kalender | `.claude/rules/plantafel-kalender.md` | Plantafel, Kalender-Sync, Farben, Fremdfirmen |
| Kunden, Ersttermine, Projekte, Mitarbeiter | `.claude/rules/kunden-ersttermine.md` | Kundenformular, Ersttermin, Projektliste, Mitarbeiter-Archiv |

---

# monti.pro — BKS BauKomplettService

Individuelle App für **BKS BauKomplettService** („Wir machen es komplett").
Projekte, Rechnungswesen, Ersttermine, Bautagesberichte, WhatsApp-Anbindung,
Google-Kalender-Sync.

Der Ordner heißt `monti.pro` (Domain), die Firma heißt **BKS BauKomplettService**.

> Dieses Dokument beschreibt nur, **was ist** — es enthält keine Vorgaben,
> wie gearbeitet werden soll.

---

## Supabase-Projekt

Projekt-ID: **`zbxizeirecoipqvxymdx`** („Monti.pro", Organisation
`epadfagtwxodsshrktno`), URL `https://zbxizeirecoipqvxymdx.supabase.co`.
Alle drei Quellen stimmen überein: `.env` → `VITE_SUPABASE_URL`,
`supabase/config.toml` → `project_id` und die von der CLI selbst hinterlegte
Verknüpfung in `supabase/.temp/linked-project.json`.

**Historie (bis 31.08.2026):** In der `config.toml` stand ein Überbleibsel aus
der Fork-Zeit — `vcrkhmvhrszwbfpgdhhs`. Gut ging das nur, weil die Verknüpfung
in `.temp/` die `config.toml` übersteuert; ohne sie hätten `supabase link`,
`db push` und `functions deploy` auf ein fremdes Projekt gezielt. Die Angabe
ist korrigiert, `.temp/` ist damit nicht mehr die einzige Absicherung.

Dieselbe Abweichung liegt (Stand 31.08.2026) noch bei **willroider** vor.

**Wichtig für die tägliche Arbeit:** Es gibt zwei getrennte Supabase-Konten.
Monti.pro liegt in der Organisation `epadfagtwxodsshrktno`; ein Token aus dem
Konto `napetschnig.chris@gmail.com` sieht das Projekt NICHT. Erkennungszeichen:
`403 … does not have the necessary privileges` heißt „falsches Konto", ein
`401 Unauthorized` heißt „Token abgelaufen". Schnelltest:
`supabase projects list` muss „Monti.pro" enthalten.

---

## Stack

| | |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| UI | shadcn/ui (Radix) + Tailwind, Alias `@` → `src/` |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| PWA | `vite-plugin-pwa` |
| Deploy | **kein `vercel.json`** — anders als die meisten Apps im Portfolio |
| Tests | Playwright (`tests/`, 4 Specs) + Vitest |
| Git | `main` → `git@github.com:enapetschnig/montipro.git` |

**Umgebungsvariablen:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
(andere Apps nutzen `VITE_SUPABASE_PUBLISHABLE_KEY` + `VITE_SUPABASE_PROJECT_ID`)

Primärfarbe: `--primary: 215 51% 25%` (Dunkelblau) in `src/index.css`

## Befehle

```bash
npm run dev     # Dev-Server
npm run build   # Produktions-Build
npm run lint    # ESLint
npm run test    # Vitest
npm run check   # Absturz-Wächter, siehe unten
```

---

## `npm run check` — der Absturz-Wächter

`scripts/check-crash-risks.mjs`. Entstand nach zwei Produktionsausfällen.
Aus dem Kopf der Datei:

> *„Zwei Produktionsausfälle hintereinander hatten dieselbe Ursache — eine
> Variable, die es zur Laufzeit nicht gibt: Stundenauswertung: `beschaeftigung`
> vor der Deklaration benutzt · Rechnung speichern: `saveBrutto` existierte
> nicht mehr.*
>
> *Beide hätte TypeScript gemeldet — aber `npx tsc --noEmit` prüfte wegen
> `files: []` in der Wurzel-tsconfig GAR NICHTS, und `tsconfig.app.json`
> scheiterte an einer beschädigten `types.ts`. Der Type-Check war also faktisch
> abgeschaltet."*

Das Skript ruft `npx tsc -p tsconfig.app.json --noEmit` auf und bricht **nur**
bei den fünf Fehlerklassen ab, die zur Laufzeit garantiert knallen:

| Code | Bedeutung |
|---|---|
| `TS2304` | Name existiert nicht |
| `TS2448` | Variable vor ihrer Deklaration benutzt |
| `TS2454` | Variable benutzt, bevor sie zugewiesen wurde |
| `TS2552` | Name existiert nicht (Tippfehler?) |
| `TS18004` | Kurzschreibweise ohne passende Variable |

Alle übrigen Typfehler werden gezählt, blockieren aber nicht — *„sonst wäre der
Wächter vom ersten Tag an rot und würde ignoriert."*

**Merke:** Ein normales `npx tsc --noEmit` in der Wurzel prüft in diesem Repo
nichts. Der Pfad `-p tsconfig.app.json` ist der wirksame.

---

## Herkunft

Fork der gemeinsamen Ur-App (Basis `20251105065433_33daeb17-…`).
187 Migrations, letzte: `20260710100000_za_rls_policies.sql`.

**Nächster Verwandter: `holzbaulutz`.** Beide teilen `useConfigOptions`,
`ConfigOptionsManager`, das Rechnungs-Layoutsystem und die
`parse-*`-Edge-Functions. monti.pro ist die umfangreichere von beiden.

---

## Rollen

Enum `app_role`: `administrator` | `mitarbeiter`, später ergänzt um `vorarbeiter`.
Feingranulare Rechte zusätzlich über den Hook `usePermissions.ts`.
Routen über `src/components/ProtectedRoute.tsx`.

---

## Module

`src/pages/` — 35 Seiten:

**Projekte**
`Projects`, `ProjectDetail`, `ProjectOverview`, `ConstructionSites`, `Reports`

**Rechnungswesen** — größtes Teilsystem
`Invoices`, `InvoiceDetail`, `InvoiceTemplates`, `PurchaseInvoices`
Layout-Engine: `lib/invoiceLayoutTypes`, `lib/loadLayout`, `lib/invoiceHtml`,
`lib/pdfLetterhead`, `lib/mahnungSettings`, Hook `useInvoiceLayout`

**Kunden & Ersttermine**
`Customers`, `Ersttermine`, `ErstterminDetail`,
`Besprechungsprotokolle`, `BesprechungsprotokollDetail`
PDF: `lib/pdfErsttermin`, Fotos: `lib/copyErstterminPhotos`

**Angebote**
`OfferPackages`

**Bautagesberichte**
`Bautagesberichte`, `BautagesberichtDetail` — PDF via `lib/pdfBautagesbericht`

**Zeiterfassung**
`TimeTracking`, `MyHours`, `HoursReport`, `FreelancerHours`
Rechenkern: `lib/hoursAccounting.ts` (**mit Unit-Test**)

**Planung & Kalender**
`ScheduleBoard`, `Calendar`
Komponenten in `src/components/calendar/` und `src/components/schedule/`
Hook `useCalendarSync`, `lib/calendarCategories`

**Material**
`MaterialList` — Einlesen über `parse-material-file` und `parse-voice-material`

**Sonstiges**
`Employees`, `Disturbances`, `DisturbanceDetail`, `MyDocuments`, `Notepad`,
`EmailLog`, `Dashboard`, `Admin`, `Auth`, `Index`, `NotFound`

---

## Edge Functions — 26, die meisten im Portfolio

**WhatsApp** (7) — im Portfolio **nur hier**
`whatsapp-webhook` · `whatsapp-send` · `whatsapp-onboarding` ·
`whatsapp-daily-reminder` · `whatsapp-channel-monitor` · `whatsapp-cleanup` ·
`forgot-password-whatsapp` (Passwort-Reset per WhatsApp)

**Google Kalender** (3) — im Portfolio **nur hier**
`google-calendar-sync` · `calendar-auto-sync` · `sync-assignment-to-calendar`

**Dokumente & KI**
`parse-invoice-document` · `parse-material-file` · `parse-voice-material` ·
`polish-text` · `generate-invoice-pdf` · `send-document-email`

**Nutzerverwaltung**
`create-user` · `delete-user` · `send-invitation` · `send-sms-invite`

**Betrieb**
`daily-error-digest` (tägliche Fehlerzusammenfassung) · `check-vat` (UID-Prüfung) ·
`create-team-time-entries` · `migrate-sick-notes` ·
`send-disturbance-report` (`verify_jwt = false`)

`_shared/` enthält gemeinsamen Code der Functions.

---

## Konfigurierbarkeit zur Laufzeit

Tabelle `admin_config_options`, gelesen über `src/hooks/useConfigOptions.ts`,
gepflegt über `src/components/admin/ConfigOptionsManager.tsx`.

Damit lassen sich Auswahllisten ändern, ohne Code anzufassen. Kategorien u. a.
über `useProjectStatuses`, `useEinheiten`, `lib/statusColors`,
`lib/executingCompanies`, `lib/documentTypes`.

---

## Weitere Hooks

`useAustrianHolidays`, `useAvailableEmployees`, `useHiddenUserIds`,
`useSessionKeepalive`, `useUnsavedChangesWarning`

## Weitere Fachlogik

`auditLog` (Änderungsprotokoll) · `projectAccess` · `mergeDuplicateProjects` ·
`zaLeaveCleanup` · `logoLoader` · `pdfPhotoGrid` · `pdfToImage` ·
`pdfUploader` · `documentTextsLoader` · `allgemeineAngaben` · `searchUtils` ·
`dateFormat` · `workingHours`

---

## Besonderheiten

- **WhatsApp als Kommunikationskanal** — inklusive Passwort-Reset, täglicher
  Erinnerung und Kanalüberwachung. Einzigartig im Portfolio.
- **Google-Kalender-Sync** in beide Richtungen
- **`daily-error-digest`** — die App meldet ihre eigenen Fehler
- **Absturz-Wächter** `npm run check` (siehe oben)
- **`exports/geloeschte_mitarbeiter`** — abgelegte Daten ausgeschiedener Mitarbeiter
- **`vorlagefunktionenapp/`** — eine vollständige Kopie einer anderen App als
  Nachschlagewerk (auch in holzbaulutz vorhanden, identischer Stand).
  Gehört nicht zum Build.

---

## Wissen ablegen (für jede KI – auch den Roboter)
- Diese Datei ist die kurze Kundenakte und bleibt unter 25 KB. Hier nur: wer der Kunde ist, feste Regeln, Technik, Index.
- Neue Erkenntnis, Fallstrick oder Entscheidung zu einem Thema → in die passende Datei unter `.claude/rules/`
  (mit Datum und, wenn von Christoph/Kunde, dem Zitat). Gibt es kein passendes Thema: neue Datei mit `paths:` auf die
  betroffenen Code-Ordner anlegen und oben im Index eintragen.
- Ausführliche Protokolle, Testberichte, Abläufe → `JOURNAL.md` oder `research_notes/`, nicht hierher.
