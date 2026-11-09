---
paths:
  - "tests/roboter/**"
  - "supabase/migrations/**"
---
# Grundtests (tests/roboter) und Datenbank-Sicherheit

## Grundtests (09.11.2026, Auftrag Christoph „Grundtests“)
- Fünf Dateien `2026-11-09-grund-1…5` + `grundtest-hilfe.ts`: Anmelden je Rolle (Benutzername → `<name>@app.monti.pro`),
  Rechte (Seiten genau nach `role_permissions`, RLS ohne Oberfläche), Stunden erfassen + Meine Stunden, Rechnung + PDF +
  fortlaufende Nummer, Bautagesbericht + PDF im Projektordner. Laufen nur gegen die Testumgebung, Kennzeichen ZZTEST.
- Testkonten brauchen `user_metadata.username`, sonst blockiert der Trigger `block_self_signup` das Anlegen.
- **Zeiterfassung speichert über die Edge Function `create-team-time-entries`** – die Testumgebung startet keine Functions.
  Vorher `ln -sfn "$PWD/supabase/functions" ~/roboter/test/monti-pro/supabase/functions` und
  `supabase functions serve --workdir ~/roboter/test/monti-pro --no-verify-jwt` (ohne `--env-file` = ohne echte Secrets).
- In der Testumgebung stehen die Zähler in `number_ranges` auf 0, die anonymisierten Kunden haben aber schon `K-00001…`
  → eigene Testkunden mit eigener `kundennummer` anlegen. `projects` lädt `daten` nicht (plz null) – Projekte selbst anlegen.
- `npx vite` (dev) scheitert hier am Datei-Wächter-Limit (ENOSPC) → `vite build --outDir /tmp/…` + `vite preview`.

## Datenbank-Sicherheit
- 09.11.2026 behoben: Ohne Anmeldung waren `profiles` (inkl. SV-Nummer, Stundenlohn, Geburtsdatum) lesbar und
  `whatsapp_messages` les-/schreib-/löschbar (Regeln galten für `public`). Jetzt `profiles`-Lesen nur `authenticated`,
  `service_role_whatsapp` nur `service_role` (Migration `20261109100000_…`). Grund-1-Test prüft alle Kerntabellen als anon.
- **Offen (nicht geändert):** Jeder *angemeldete* Benutzer kann weiterhin alle Profile samt SV-Nummer und Stundenlohn
  der Kollegen lesen. Enger machen erst nach Prüfung aller Stellen, die `profiles` lesen (Namen in Listen) – eigener Auftrag.
- Migrationen ab 27.08.2026 sind remote nicht in der Historie (per Management-API eingespielt) → **kein `supabase db push`**,
  einzelne Datei per `supabase db query --linked -f …` (vorher Trockenlauf `BEGIN … ROLLBACK`).
