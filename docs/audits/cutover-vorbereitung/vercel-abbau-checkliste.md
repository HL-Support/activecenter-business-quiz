# Vercel-Abbau — Checkliste

Angelegt 26.08.2026 · Auszuführen **frühestens 01.09., empfohlen 08.09.2026** (7–14 Tage
nach dem Cutover vom 25.08.), und nur wenn die Vorbedingungen unten erfüllt sind.

🔴 **Bis dahin gilt: Vercel ist der Rückweg. Nichts davon vorziehen.** Der Rückweg ist ein
DNS-Wert je Domain ([rueckrolldaten/](rueckrolldaten/)) plus der vierte, DNS-unabhängige
Eingang `businessleadsquiz.vercel.app`.

## Vorbedingungen (alle messen, nicht erinnern)

- [ ] Seit dem Cutover **kein** Hosting-Vorfall auf Coolify (GlitchTip, Wächter-Protokolle,
      `docker logs` Fehlerzähler)
- [ ] Domain-Sweep und Nurture-Wächter seit mindestens 7 Tagen ohne neuen ALARM
- [ ] Alle 4 n8n-Workflows weiterhin `success` (Stichprobe über `v_nurture_runs_wahr`
      und die Ausführungsliste)
- [ ] Zertifikate: alle drei Domains > 60 Tage Restlaufzeit (Sweep-Spalte `Rest`)
- [ ] Markus hat den Abbau ausdrücklich freigegeben — **damit wird der Hosting-Rückweg
      bewusst aufgegeben**

## Reihenfolge

1. **Vierten Eingang stilllegen** — `businessleadsquiz.vercel.app`:
   - vorher prüfen, ob er noch Verkehr bekommt (Vercel-Analytics/Logs); wenn ja: woher?
   - Er steht in der eigenen CORS-Allowlist (`server/lead-system.js`) — Eintrag entfernen
     (Code-PR), sonst bleibt eine tote Referenz stehen.
2. **Domains vom Vercel-Projekt lösen** (`business.activecenter.info`,
   `quiz.activecenter.info`, `business.eaglesfit.ch`) — DNS zeigt längst auf Coolify,
   das Lösen ist rein administrativ. Danach die Preview-Suffix-Konstante in
   `server/lead-system.js` prüfen (CORS für Vorschau-Deployments — wird gegenstandslos).
3. **Auto-Deploy auf Vercel trennen** (Git-Integration) — sonst baut jeder Merge weiter
   ein totes Deployment. Das Repo bleibt unangetastet.
4. **Vercel-Umgebungsvariablen exportieren und sichern** (ins Scratchpad/Secrets, nicht
   ins Repo), erst danach das Projekt archivieren/löschen.
5. **Doku nachziehen:** Cutover-Protokoll (Abschluss-Vermerk), STATUS §8, Rückweg-Kapitel
   in [rueckrolldaten/README.md](rueckrolldaten/README.md) als „historisch" markieren.
6. **Nicht vergessen:** `zzz-business-schulung` (altes Vercel-Projekt, 308-Redirect) —
   Entscheidung, ob es mit abgeräumt wird (eigene Nachlauffrist laut Audit Phase 7).

## Was danach NICHT mehr geht

- Hosting-Rollback per DNS (nur noch Datenbank-Rollback-Verfahren laut Audit §9)
- Der Vercel-Stand als Vergleichsreferenz bei Fehlersuche

---

## Beiblatt: Phase-6-Voraussetzung bereits erfüllt (26.08.2026, gemessen)

Direktverbindungs-/IPv6-Test von `10.0.1.3` (DB-Server, öffentlich `91.99.76.104`) zu
Supabase — Audit-Anforderung „vor Phase 6 dokumentiert":

| Prüfung | Ergebnis |
| --- | --- |
| Globale IPv6-Adresse der Box | vorhanden (`2a01:4f8:1c1a:dc7d::1/64`) |
| `db.xlpiisbozpgmemxhtivj.supabase.co` | löst auf IPv6 auf (`2a05:d018:…`) |
| TCP 5432 zum Direkthost (IPv6) | **verbunden** |
| Pooler `aws-0-eu-central-1.pooler.supabase.com` (IPv4-Rückfallebene) | verbunden auf **5432** (Session) und **6543** (Transaktion) |

Die Replikations-Subscription der Phase 6 kann also direkt aufbauen; der Pooler steht als
IPv4-Weg bereit, falls IPv6 im Cutover-Moment klemmt.
