---
paths:
  - "src/pages/TimeTracking.tsx"
  - "src/pages/MyHours.tsx"
  - "src/pages/HoursReport.tsx"
  - "src/pages/FreelancerHours.tsx"
  - "src/lib/hoursAccounting.ts"
  - "src/lib/hoursAccounting.test.ts"
  - "src/lib/workingHours.ts"
  - "src/lib/zaLeaveCleanup.ts"
  - "src/hooks/useAustrianHolidays.ts"
  - "src/components/AdminTimeEntryDialog.tsx"
  - "supabase/functions/create-team-time-entries/**"
---
# Zeiterfassung, Soll, Zeitausgleich (ZA), Zeitkonto

## Arbeitszeitmodell
- **4-Tage-Woche:** Soll Mo–Do je 10 h, Freitag entfällt (Christoph April 2026: „freitag entfällt“) –
  `getNormalWorkingHours` in `src/lib/workingHours.ts`, Wochensoll 40 h. Kein Tageslimit für Buchungen
  („du sollst gar kein zeit limit haben für den tag“).
- Feiertage (Tabelle `austrian_holidays`, 2026–2029) zählen automatisch in Plantafel, Kalender und Saldo (25.06.).
- Soll ist **kalenderbasiert** (z. B. 180 statt 160 h, Mail Juli 2026), laufender Monat nur **bis gestern**, künftige Monate 0,
  Ein-/Austrittsdatum wird beachtet. Rechenkern `src/lib/hoursAccounting.ts` mit Regressionstests
  `hoursAccounting.test.ts` – jede Änderung dort mit Test.
- Neue Buchung startet zur Endzeit des letzten Eintrags (statt +30 min, Juli 2026). Auch an Abwesenheitstagen darf
  zusätzlich gearbeitete Zeit gebucht werden (14.07.: 8 h ZA + 2 h Arbeit).

## Zeitausgleich und Zeitkonto
- ZA zählt im Auto-Saldo **neutral**; abgezogen wird genau **einmal** über das Zeitkonto (`time_accounts`, „Manuell“).
  Früher Doppelzählung (10 h ZA = −20 h, behoben 06.07.). Abwesenheitsstunden decken höchstens das Tagessoll (kein
  „Gratis-Plus“ am Freitag/Feiertag), echte Arbeit zählt voll.
- ZA anlegen geht über drei Wege (Selbstservice, Admin-Dialog, Plantafel) – alle ziehen vom Konto ab und legen einen
  Abwesenheits-Block an; Löschen bucht zurück (`zaLeaveCleanup.ts`). Manuell nachtragen muss möglich bleiben
  (Christoph: „ja es sollte schon manuell auch möglich sein“).
- UI nutzt `totalAutoSaldo` (buchungsbasiert). `totalAutoSaldoKalender` ist getestet, aber **nicht im UI** – es würde
  Altkonten wie Stidl (Eintritt 1999) mit −56.299 h zeigen.
- **Offene Daten-Entscheidung:** Judith Postels Zeitkonto steht auf −12 h statt rechnerisch −30 h (Altlast). Christoph
  24.07.: „das mit dem zeitkonto lassen wir vorerst“ – **nicht ohne neue Freigabe korrigieren**.

## Rollen
- Freie Mitarbeiter (Freelancer) erfassen nur Projektzeiten über ein einfaches Formular (`/freelancer`), bekommen
  Onboarding/Zugang, aber nicht die normale App.
- Admin darf alle Einträge bearbeiten; alles muss danach synchron sein (Saldo, Plantafel, WhatsApp).
