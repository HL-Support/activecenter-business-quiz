# Rückrolldaten des Hosting-Cutovers vom 25.08.2026

Der Weg zurück von Coolify auf Vercel ist **ein DNS-Wert je Domain**. Diese Dateien halten
den Stand fest, wie er unmittelbar vor der Umstellung war — inklusive Record-id, damit der
alte Eintrag zielgenau wiederhergestellt wird und nicht geraten werden muss.

| Datei | Domain | Ziel bei Rückrollung |
| --- | --- | --- |
| `dns-rollback-eaglesfit.json` | `business.eaglesfit.ch` | `CNAME 2940e78cbc83cdf4.vercel-dns-017.com` |
| `dns-rollback-quiz.json` | `quiz.activecenter.info` | `CNAME 2940e78cbc83cdf4.vercel-dns-017.com` |
| `dns-rollback-business.json` | `business.activecenter.info` | `CNAME 12b0f53f0226bb49.vercel-dns-017.com` |

Zone `activecenter.info`: `0b43ccb0e932d3bb314941e9e57c5d00` ·
alle Einträge TTL 60, **nicht** proxied.

## Rückrollung

Cloudflare-API, `PUT` auf den Record aus der jeweiligen Datei, mit `type`, `name`, `content`
von dort, `ttl: 60`, `proxied: false`. Bei TTL 60 greift der alte Weg nach spätestens einer
Minute; gemessen am 25.08. waren es **20 Sekunden**.

Danach prüfen, dass wieder Vercel antwortet — und zwar an einem Merkmal, das eindeutig ist:

- `Server: Vercel` in der Kopfzeile, **und**
- `/health/live` liefert **404** (den Endpunkt gibt es nur auf dem Coolify-Stand)

Ein Zertifikat mit dem richtigen Namen beweist **nichts** — beide Seiten haben eines.

## Warum Vercel stehen bleibt

Vercel wird 7 bis 14 Tage nach dem Cutover **nicht angefasst**. Zusätzlich existiert mit
`businessleadsquiz.vercel.app` ein vierter, DNS-unabhängiger Eingang in denselben
Vercel-Stand — er funktioniert auch dann, wenn eine Domain klemmt.

Gegenprobe am 25.08. um 19:16: `/markus` HTTP 200 mit `Server: Vercel`, `/health/live` 404,
`resolve_resume_key` löst korrekt auf. Der Rückweg ist also nicht nur konfiguriert, sondern
nachweislich lauffähig.
