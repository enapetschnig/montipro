---
paths:
  - "src/pages/ScheduleBoard.tsx"
  - "src/pages/Calendar.tsx"
  - "src/components/schedule/**"
  - "src/components/calendar/**"
  - "src/components/admin/GoogleCalendarSettings.tsx"
  - "src/hooks/useCalendarSync.ts"
  - "src/lib/calendarCategories.ts"
  - "supabase/functions/google-calendar-sync/**"
  - "supabase/functions/calendar-auto-sync/**"
  - "supabase/functions/sync-assignment-to-calendar/**"
---
# Plantafel und Google-Kalender

- Plantafel im PlanCraft-Stil (Teams, Einsätze, drei Bereiche; April 2026), Ansichten 2 Wochen/Monat/Jahr,
  Drag & Drop für Projekt-Balken (Mai/Juni), **Doppelklickschutz** beim Speichern (`setSaving(true)` sofort).
- Fremdfirmen/Subfirmen als eigene Zeilen in Plantafel und Plankalender (06.07.).
- Farben je Mitarbeiter aus dem Admin (`employee_schedule_colors` nutzt `employee_id`, Anzeige über Mapping in
  `useScheduleData.ts`); Lieblingsfarben für neue Projekte mit wählbarer Textfarbe/Auto-Kontrast (06.07.).
- **Google-Kalender beidseitig** über Service-Account (`…@epowergmbh.iam.gserviceaccount.com`); Christoph will „100%
  synchron in beide Richtungen“ und mehrere Kalender (Kalender = Geschäftsbereich; im App-Kalender sichtbar, in welchem
  Kalender ein Termin liegt; Ziel-Kalender beim neuen Termin wählbar).
- Bekannter Fallstrick: Plantafel-Einsätze erschienen 3- bis 5-fach im Google-Kalender, weil der Rückimport sie erneut
  einlas. Gegenmittel: Marker `[montipro-plantafel]` in den Sync-Functions, Update statt Neuanlage über vorhandene
  `google_event_id`, App-Kalender filtert Events mit gleicher `google_event_id`. Bei Änderungen am Sync immer auf
  Dubletten testen.
- Wechselt der Geschäftsbereich eines Projekts, muss der Termin im Google-Kalender mitwandern (April 2026, Projekt
  „Portas/Hobinger Pottendorf“).
