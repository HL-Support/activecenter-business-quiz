# Business Leads Quiz: Bridge-Vertraege

Stand: 28.08.2026 (Coolify seit 25.08.; forward_typeform_adapter schreibt seit 27.08. Kontakt und alle sechs Antworten atomar über submit_lead_complete)

`/api/bridge` ist die projekteigene API-Bridge des Business Leads Quiz (seit 25.08.2026 im Coolify-Container, zuvor Vercel). Sie ist eine oeffentliche Systemgrenze: Browser, Smoke-Tests und der aktive n8n-Nurture-Workflow greifen darauf zu. Deshalb duerfen Action-Namen, Pflichtfelder und Antwortfelder nicht still geaendert werden.

Die maschinenlesbare Liste liegt in `scripts/lib/bridge-contracts.js`. `npm test` prueft, dass jede dokumentierte Action weiter existiert und dass jeder Browser-Aufruf dokumentiert ist.

## Kritische Schreibpfade

| Action | Aufrufer | Pflichtdaten | Wirkung |
| --- | --- | --- | --- |
| `forward_typeform_adapter` | Quiz-Opt-in | Adapter-Key, Payload, erlaubtes Ziel | Speichert den Lead, leitet den Webhook weiter und sendet das Meta-Signal. |
| `update_points_result` | Quiz und Videoabschluss | Payload mit Lead-/Session-Kontext | Aktualisiert den sichtbaren Fortschritt und spiegelt abgeschlossene Videos. |
| `notify_all_videos_completed` | Video 3 | `completed_steps` | Erst bei 1, 2 und 3 wird die Benachrichtigung ueber den kanonischen Outbox-Weg ausgeloest. |
| `track_event` | Seitentracking | `session_hash` oder `hash` | Schreibt ein Analytics-Ereignis. |
| `write_analytics_batch` | Event-Batcher | Nicht leeres Event-Array | Schreibt Analytics-Ereignisse in begrenzten Paketen. |

## Resume-Vertraege

| Action | Aufrufer | Erfolgsfelder |
| --- | --- | --- |
| `generate_resume_token` | n8n, Smoke-Test | `success`, `token`, `leadHash`, `resumeTarget`, `resumeUrl`; nach Moeglichkeit auch `shortKey`, `shortUrl` |
| `resolve_resume_token` | Browser-Start | `success`, `sessionHash`, `leadHash`, `email`, `resumeTarget`, Fortschrittsfelder |
| `resolve_resume_key` | Browser-Start, Smoke-Test | `success`, `sessionHash`, `leadHash`, `resumeTarget`, Fortschrittsfelder |

Wichtig: `generate_resume_token` wird extern vom aktiven n8n-Workflow `RqKSRTgFv8mv04H2` ueber `https://business.activecenter.info/api/bridge` aufgerufen.

## Sichere Aenderungsregel

1. Bestehende Felder nur ergaenzen, nicht umbenennen oder entfernen.
2. Neue Pflichtfelder erst nach einer kompatiblen Uebergangsphase einfuehren.
3. Vor jedem Deploy `npm test`, `npm run build`, `npm run verify` und die Smoke-Tests ausfuehren.
4. Schreibende Smoke-Tests ausschliesslich mit klar markierten Testkontakten ausfuehren.
5. Der Read-only-Smoke darf weder E-Mails noch Webhooks oder Meta-Conversions ausloesen.

## Nicht Teil dieses Vertrags

Die zentrale PHP-Bridge auf dem Laravel-Server ist ein separates System. Die projekteigene Bridge darf nicht durch eine reduzierte Kopie ersetzt werden, solange externe Aufrufer und Proxy-Aktionen nicht vollstaendig migriert und parallel getestet wurden.
