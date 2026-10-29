---
paths:
  - "supabase/functions/whatsapp-*/**"
  - "supabase/functions/forgot-password-whatsapp/**"
  - "src/components/WhatsAppAdminSettings.tsx"
  - "src/components/WhatsAppStatus.tsx"
  - "supabase/migrations/*whatsapp*.sql"
---
# WhatsApp-Bot (Whapi.cloud) – nur in monti.pro

- Anbieter **Whapi.cloud**; Token liegt als Secret (nie in Doku/Code). Webhook ohne JWT (`verify_jwt = false`,
  Deploy mit `--no-verify-jwt`), sonst 401.
- Zweck (Christoph April 2026): **nur Zeitschreiben und Projektfotos**, keine Tagesberichte – „sollte komplett verlässlich
  funktionieren wie ein intelligenter ki agent“. Morgennachricht enthält die Plantafel-Einteilung des Tages.
- Foto ohne Text → Bot schlägt nummerierte Liste vor: zuerst „Heute eingeteilt“, dann „Andere aktive Projekte“.
  Bot und Auswahllisten zeigen **nur aktive Projekte** (nicht „Abgeschlossen“); Projektzugriffe synchron mit der App.
- Erinnerungen morgens/abends per pg_cron **nur Mo–Fr und nicht an österreichischen Feiertagen** (`austrian_holidays`),
  Dedup über `employees.whatsapp_last_morning_date` / `_last_evening_date`. Telefonnummer trägt zuerst der Admin ein;
  aktive Nummern in den WhatsApp-Einstellungen sichtbar und schaltbar.
- **Auth-Verlust ca. alle 30 Tage** (zuletzt immer um den 20.): Christoph scannt den QR neu. Überwachung
  `whatsapp-channel-monitor` alle 6 h (Tabelle `whatsapp_channel_health`, Migration 20260625100000).
  Status-Code 4/„AUTH“ mit verknüpftem User gilt als **gesund**; Warnmail nur einmal je Ausfall.
- Warnmails gehen **an Christoph** (`app_settings.whatsapp_channel_alert_recipient` = napetschnig.chris@gmail.com),
  nicht an montage@monti.pro und nicht über Whapi (26.06.).
- Nach Re-Auth prüfen: Morgen-Erinnerung mit `force` auslösen, `sentCount` kontrollieren (26.06.: 2 = Judith, Günter).
