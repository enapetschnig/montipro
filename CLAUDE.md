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
