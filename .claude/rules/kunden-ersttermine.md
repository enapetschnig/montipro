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
  Status „Storniert“. Jeder Mitarbeiter hat Zugriff auf alle Projekte (April 2026).

## Mitarbeiter
- Ausscheiden statt Löschen (Mitarbeiter-Archiv mit Reaktivierung, 06.07.); gelöschte/ausgeschiedene Mitarbeiter dürfen
  nicht in Auswahllisten auftauchen (Beispiel Jarko Ribarski). Daten ausgeschiedener unter `exports/geloeschte_mitarbeiter`.
- Dashboard-Banner „Benutzer wartet auf Freischaltung“ führt direkt zur Freischaltung (25.06.).
