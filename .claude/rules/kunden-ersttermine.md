---
paths:
  - "src/pages/Customers.tsx"
  - "src/components/Customer*.tsx"
  - "src/pages/Ersttermin*.tsx"
  - "src/lib/pdfErsttermin.ts"
  - "src/lib/copyErstterminPhotos.ts"
  - "src/pages/Projects.tsx"
  - "src/pages/ProjectDetail.tsx"
  - "src/pages/Employees.tsx"
---
# Kunden, Ersttermine, Projekte, Mitarbeiter – Wünsche BKS

## Kunden
- Neuer Kunde: zuerst **Geschäftlich/Privat**; Geschäftlich → Firmenname (+ UID), Privat → Anrede, Titel, Vorname,
  Nachname, **keine UID** (30.04.). Kundennummer automatisch (Trigger, Migration `20260422210000_customer_number_trigger.sql`),
  Kundenliste nach Nachname sortiert, wichtiges Datum (Geburtstag, Projektübergabe).
- Filter Privat/Gewerbe, farbliche Hervorhebung, Herkunft/Referenz als erweiterbare Liste; PLZ/Ort bei Kontaktdaten,
  nicht unter dem Namen (21.04.). In Belegen/Formularen Kunden nur auswählen oder neu anlegen, keine Inline-Bearbeitung.

## Ersttermine und Projekte
- Ersttermin = ein Formular für alles, Checkliste bearbeitbar, Fotos sofort, keine Unterschriften, „Kundendaten übernehmen“;
  Fotos beim Umwandeln ins Projekt kopieren (`copyErstterminPhotos.ts`, Fehler „0 kopiert 3 übersprungen“ behoben 07/2026).
- Haupt-/Unterprojekte (`projects.parent_project_id`, 15.06.), Unterprojekte einklappbar, Archiv-Reiter für abgeschlossene,
  Status „Storniert“. Sichtbarkeit (Stand 09.11.2026 geprüft): Admin und Vorarbeiter sehen alle Projekte, **Mitarbeiter nur
  zugewiesene** (`verantwortlicher_id`/`bauleiter_id`/`zugewiesene_mitarbeiter`, RPC `list_accessible_project_ids_for_user`,
  bewusst so seit 21.04.2026, Commit f540c86) – die frühere Notiz „jeder sieht alle Projekte“ war überholt.

## Mitarbeiter
- Ausscheiden statt Löschen (Mitarbeiter-Archiv mit Reaktivierung, 06.07.); gelöschte/ausgeschiedene Mitarbeiter dürfen
  nicht in Auswahllisten auftauchen (Beispiel Jarko Ribarski). Daten ausgeschiedener unter `exports/geloeschte_mitarbeiter`.
- Dashboard-Banner „Benutzer wartet auf Freischaltung“ führt direkt zur Freischaltung (25.06.).

## Kontakthistorie (11.11.2026)
- `profiles` hat **keine Spalte `role`** – Rolle immer aus `user_roles` (Werte `administrator`/`vorarbeiter`/`mitarbeiter`, nicht „admin“). `ContactHistoryTimeline` las `profiles.role` → 4× „column profiles.role does not exist“ im Log und Admin sah bei fremden Einträgen kein „Löschen“; behoben, Probefahrt `tests/roboter/2026-11-11-kontakthistorie-rolle.spec.ts`.
