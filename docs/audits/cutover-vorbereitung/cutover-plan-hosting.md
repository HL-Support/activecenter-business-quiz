> ✅ **AUSGEFÜHRT am 25.08.2026.** Dieser Plan ist im Futur geschrieben, aber erledigt.
> Was tatsächlich passierte, steht im
> [Cutover-Protokoll](cutover-protokoll-2026-08-25.md).
>
> §5 („Vercel bleibt 7–14 Tage") ist überholt: Der Abbau ist seit 27.08. freigegeben und
> wartet nur noch auf die Datums-Tore (01.09. / 03.09.).
>
> 🔴 `scripts/router_check.py` und `scripts/verify.py` in §6.3 liegen im **Coolify**-Repo,
> nicht in diesem.

---

# Cutover-Plan: Hosting Vercel → Coolify (Phase 3)

Stand: 25.08.2026. Grundlage: [Aufrufer-Inventar](aufrufer-inventar-2026-08-25.md),
[Statusdokument](../STATUS-migrationsvorbereitung-2026-08-25.md) §5F,
Coolify-Projektregeln (`activecenter-web/coolify/AGENTS.md`, Regel 2: **kein Cutover ohne
Markus' ausdrückliche Freigabe**).

Dieser Schritt wechselt **ausschließlich das Hosting**. Supabase bleibt unverändert die
kanonische Datenquelle, MySQL/PHP-Bridge/n8n/Mautic bleiben unberührt. Damit ist der
Rollback ein reiner DNS-Vorgang ohne Datenrückführung.

## 1. Ausgangslage (belegt)

| Punkt | Stand |
| --- | --- |
| Staging | `business-leads-test.hl-support.biz`, identisch zur Produktion getestet |
| Container | non-root, HEALTHCHECK, SIGTERM-Drain, Digest-gepinnt, Ressourcengrenzen |
| Env-Parität | JWT byte-genau am Container verifiziert (`is_literal`), alle übrigen Werte gehasht verglichen |
| Resume-Links | an drei echten Leads bewiesen: Produktion erzeugt → Coolify löst identisch auf |
| Externe Aufrufer | 4 n8n-Workflows (alle Auth-Header, keine feste IP), 0 eingehende Dienstleister-Webhooks |
| Datenverbraucher | 13 von 14 erreichen ihre Daten an den Domains vorbei |
| Rollback-Weg | Vercel bleibt vollständig lauffähig; zusätzlich `businessleadsquiz.vercel.app` als vierter, DNS-unabhängiger Eingang |

## 2. Reihenfolge — eine Domain nach der anderen

Bewusst **nicht** alle drei gleichzeitig: Traefik stellt das Zertifikat erst aus, wenn der
Name auf die Box zeigt; und in der Zone `eaglesfit.ch` liegt bereits eine fremde App auf
derselben Box (Router-Priorität, B-neu11).

| Stufe | Domain | Warum in dieser Reihenfolge |
| --- | --- | --- |
| 1 | `business.eaglesfit.ch` | geringste Last, in **keinem** n8n-Workflow referenziert — echter Kanarienvogel |
| 2 | `quiz.activecenter.info` | Legacy-/Resume-Pfad, von der global-sce-Landeseite und einem Mautic-Template genutzt |
| 3 | `business.activecenter.info` | Hauptdomain der bezahlten Werbung — zuletzt, wenn 1+2 unauffällig sind |

Zwischen den Stufen: mindestens 30 Minuten Beobachtung, bei Stufe 3 mindestens 2 Stunden.

## 3. Vorbereitung (am Cutover-Tag, vor der ersten Umstellung)

1. **DNS-TTL** aller drei Records auf 60 s senken, **24 h vorher** (sonst wirkt ein Rollback
   verzögert). Danach Bestätigung, dass die alte TTL überall abgelaufen ist.
2. Produktions-App in Coolify anlegen (getrennt von Staging), Env **byte-genau** setzen —
   inkl. `is_literal` für den JWT-Wert — und **am laufenden Container hashen und gegen
   Vercel/Produktion vergleichen** (Pflichtprüfung, siehe §5F).
3. Deploy, dann gegen die *Coolify-URL* (noch ohne Kundendomain) die volle Probenbatterie:
   Health, beide Shells, API-Verträge, Security-Header inkl. HSTS, ein markierter
   E2E-Testlead, ein von der Produktion erzeugter Resume-Link.
4. `router_check.py` und Stichproben auf 3 fremde Produktiv-Domains der Box (vorher/nachher).
5. Monitoring: **kein** neuer Better-Stack-Monitor (Kontingent 10/10 belegt, und das
   Flottenschema führt Anwendungen ohnehin über die Sammelliste). Stattdessen nach Stufe 3
   eine Zeile in `HL-Support_Analytics/api/sites-health.js`:
   `{ key: "business-leads", label: "Business-Leads-Quiz",
   url: "https://business.activecenter.info/health/live", expect: [200] }` — bewusst
   `/health/live`: `/` läge auch dann bei 200, wenn der Node-Prozess tot ist, und
   `/health/ready` würde eine Supabase-Störung als Ausfall dieser Anwendung melden.
   Vorbedingung: Der Pfad existiert erst nach dem Cutover (auf Vercel heute 404) — der
   Eintrag darf deshalb **erst danach** hinzukommen. Die beiden anderen Domains deckt der
   stündliche `verify.py --domain-sweep` ab.
6. n8n: **nicht** anfassen. Die vier Workflows rufen Domainnamen auf und wandern automatisch
   mit. (Nur falls ein Workflow eine feste Vercel-URL trüge — laut Inventar tut das keiner.)

## 4. Durchführung je Stufe

1. Cloudflare-Record der Domain von CNAME → A auf `167.233.251.217` ändern (**nur den
   eigenen Record; niemals das gemeinsame CNAME-Ziel anfassen**, D2c: `www.global-sce.com`
   teilt das Ziel, gehört aber einem fremden Projekt).
2. Warten, bis Traefik das Zertifikat ausgestellt hat; erst dann fachlich prüfen.
3. Prüfen (in dieser Reihenfolge): TLS gültig → `/health/live` → Funnel-Seite → `/berater-info`
   → ein Resume-Link (Kurzform **und** JWT) → ein markierter E2E-Testlead bis zur
   Hot-Lead-Mail → `router_check.py` → Stichprobe fremder Apps.
4. Monitor für die Domain scharf schalten.
5. Beobachtungsfenster abwarten (30 min / Stufe 3: 2 h), dabei die Vercel-Logs auf
   verbleibenden Traffic ansehen (zeigt, ob noch jemand die alte Adresse erreicht).

## 5. Rollback

**Auslöser** (einer genügt, keine Diskussion im Moment des Vorfalls):

- Funnel-Seite, `/berater-info` oder ein Resume-Link antwortet nicht korrekt
- ein markierter Testlead erzeugt keinen Rang-3-Outbox-Job oder keine Hot-Lead-Mail
- eine fremde App der Box wird auffällig (Router-Konflikt)
- n8n-Workflow meldet Fehler gegen unsere Domains
- Zertifikat nicht innerhalb von 15 Minuten ausgestellt

**Vorgehen:** Cloudflare-Record der betroffenen Domain zurück auf das dokumentierte
Vercel-CNAME. Bei TTL 60 s wirkt das binnen Minuten. Kein Datenrollback nötig — Supabase war
durchgehend die einzige Wahrheit; Events, die währenddessen entstanden, sind durch die
Client-Queue idempotent und gehen nicht verloren.

**Nachlauf:** Vercel bleibt 7–14 Tage vollständig lauffähig (Projekt, Env, Domains). Erst
danach und nur auf ausdrückliche Entscheidung wird der Rollbackweg aufgegeben (Phase 7).

## 6. Abnahmekriterien für „Cutover erfolgreich"

- alle drei Domains liefern TLS, Funnel, `/berater-info` und Resume-Links korrekt
- ein markierter E2E-Lead pro Domain: 100 % Ack-Rate, Rang 3, genau eine Hot-Lead-Mail
- `router_check.py` unauffällig, fremde Apps unverändert
- alle vier n8n-Workflows nach dem Wechsel mindestens einmal `success`
- `/health/live` zeigt den erwarteten Commit und `commit_source` (seit PR #74): Damit ist am
  laufenden Container beweisbar, welche Version ausgeliefert wird — Grundlage jedes
  Rollback-Beweises. Coolify reicht den Commit NICHT als Build-Arg durch; er kommt zur
  Laufzeit aus `SOURCE_COMMIT`.
- 48 h ohne Vorfall, danach gilt der Hosting-Wechsel als stabil

## 7. Was dieser Schritt ausdrücklich NICHT tut

Kein Datenumzug (Phase 5/6), keine Kysely-Umstellung (Phase 4), keine Änderung an n8n,
Mautic, Meta, Postmark oder der PHP-Bridge, kein Abschalten von Vercel, kein Entfernen des
vierten Eingangs `businessleadsquiz.vercel.app`.
