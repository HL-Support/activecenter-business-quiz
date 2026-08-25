# Cutover-Protokoll Hosting — 25.08.2026

Mitschrift des tatsächlichen Ablaufs, nicht des geplanten. Plan:
[cutover-plan-hosting.md](cutover-plan-hosting.md) · Aufrufer:
[aufrufer-inventar-2026-08-25.md](aufrufer-inventar-2026-08-25.md)

Ziel: die drei Domains des Business-Leads-Quiz von Vercel auf Coolify
(`167.233.251.217`, App `business-leads-prod`, uuid `yhoacszoiofuq6dg4mykyr7b`) umziehen —
nacheinander, mit voller Prüfkette je Stufe und jederzeit möglichem Rückweg über einen
einzigen DNS-Wert.

**Zeiten:** lokale Zeit (Mitteleuropäische Sommerzeit, UTC+02:00), UTC in Klammern.
Container-Logs, Zertifikate und die Cloudflare-API liefern UTC — beim Nachlesen dort also
zwei Stunden abziehen.

---

## Reihenfolge und Begründung

| Stufe | Domain | Warum an dieser Stelle |
| --- | --- | --- |
| 1 | `business.eaglesfit.ch` | geringste Reichweite — Fehler kosten hier am wenigsten |
| 2 | `quiz.activecenter.info` | Alt-Domain, trägt die Resume-Aufrufe der Landeseite `global-sce.com` |
| 3 | `business.activecenter.info` | **hier läuft die bezahlte Werbung** — zuletzt, mit dem längsten Beobachtungsfenster |

---

## Stufe 1 — `business.eaglesfit.ch`

**DNS:** `CNAME` → `A 167.233.251.217`, TTL 60, nicht proxied.
Rückrolldaten: `scratchpad/dns-rollback-eaglesfit.json`.

| Prüfung | Ergebnis |
| --- | --- |
| Zertifikat | `CN=business.eaglesfit.ch`, Let's Encrypt, gültig bis 23.11.2026 |
| `/health/live` | 200 |
| `/markus`, `/berater-info` | 200 / 200 |
| unbekannte API-Route | JSON-404 |
| HSTS | `max-age=63072000; includeSubDomains` |
| echter Generator-Link, 1:1 übernommen | auf Vercel und Coolify identisch aufgelöst |
| Browser-Vergleich | beide Hosts zeigen dieselbe Funnel-Stelle |
| `router_check.py` | „unauffaellig" |
| Nachbar-Apps | unverändert |
| E2E-Testlead | 97 Aufrufe, 0 Antworten ≥ 400, 94/94 Sitzung `match`, 3/3 Videos, Abschluss 200 |

**Ergebnis: bestanden.**

---

## Stufe 2 — `quiz.activecenter.info`

**Vorbereitung ohne Verkehrswirkung:** Domain der Produktions-App zugewiesen
(`fqdn` = `business.eaglesfit.ch,quiz.activecenter.info`), Deploy angestoßen, damit Traefik
die Route bekommt. Beide Router-Regeln danach am Container nachgewiesen
(`http-1-…` und `https-1-…` mit `certresolver=letsencrypt`).

**Vorabprobe gegen die Server-IP mit Host-Kopf — vor der DNS-Änderung:**
`/health/live` 200, `/markus` 200, `/berater-info` 200, CORS-Kopf für
`https://global-sce.com` korrekt gesetzt.

**DNS:** `CNAME 2940e78cbc83cdf4.vercel-dns-017.com` → `A 167.233.251.217`, TTL 60,
nicht proxied. Rückrolldaten: `scratchpad/dns-rollback-quiz.json`.
Propagierung nach 10 s, Zertifikat nach weiteren 10 s.

| Prüfung | Ergebnis |
| --- | --- |
| Zertifikat | `CN=quiz.activecenter.info`, Let's Encrypt, 25.08. → 23.11.2026 |
| `/health/live` / `/health/ready` | 200 / 200 |
| `/markus`, `/berater-info` | 200 / 200 |
| unbekannte API-Route | `{"success":false,"error":"api_route_not_found"}`, HTTP 404 |
| HTTP → HTTPS | 307 auf `https://` |
| HSTS | `max-age=63072000; includeSubDomains` |
| CORS für `global-sce.com` | `Access-Control-Allow-Origin` korrekt |
| echter Resume-Link **ohne** `&target=` | 14 von 14 Feldern identisch zu Vercel |
| Browser-Vergleich | beide Hosts zeigen dieselbe Funnel-Stelle, keine Konsolenfehler |
| `router_check.py` | „unauffaellig", 203 Router auf 24 Containern, 18 Zonen je 503 |
| Nachbarn Zone `activecenter.info` | alle 8 normal (200/301/302/307) |
| Container-Logs | 0 Fehlerzeilen |
| E2E-Testlead `qz_c649b462f4dc4823a497bfa71656f0b6` | 97 Aufrufe, 0 Antworten ≥ 400, 94/94 `match`, 95 Ereignisse gespeichert (94 als Testverkehr markiert), 3/3 Videos, Abschluss bis WhatsApp |

**Ergebnis: bestanden.** Beobachtungsfenster 30 Minuten, sechs Messpunkte.

### Nebenbefund: Konsolenmeldungen von Bunny

Im Testlauf erschienen 182 Konsolenmeldungen. Aufschlüsselung: 133 Latenzmessungen des
Bunny-Players über rund 90 Randserver, 40 Sitzungs-Beacons, 4 abgebrochene Videodaten,
2 Namensauflösungen, 3 sonstige. **180 davon sind `ERR_ABORTED`** — der Player bricht diese
Aufrufe selbst ab, das ist so gebaut.

Entscheidend: **kein einziger betrifft einen unserer Hosts**, und auf Vercel waren es mehr,
nicht weniger.

| Umgebung | Konsolenmeldungen je Lauf |
| --- | --- |
| Vercel (5 Läufe) | 199, 208, 216, 245, 246 |
| Coolify Stufe 1 | 154 |
| Coolify Stufe 2 | 182 |

**Kein Handlungsbedarf.** Abschaltbar wäre das allenfalls in der Bunny-Video-Bibliothek, um
den Preis von Bunnys Routenoptimierung.

---

## Stufe 3 — `business.activecenter.info`

**Vorbereitet, rein lesend, vor der Freigabe:**

- Rückrolldaten gesichert: `scratchpad/dns-rollback-business.json`
  (`CNAME business.activecenter.info → 12b0f53f0226bb49.vercel-dns-017.com`, TTL 60,
  nicht proxied, Record-id `74aeca3b5f7a079630c24229a63b100d`)
- Domain steht bereits in der CORS-Allowlist (`server/lead-system.js:333`)
- Domain ist die kanonische Rückfallbasis für Resume-Links (`api/bridge.js:267`) — die
  Mail-Links ändern sich durch den Wechsel **nicht**

### Erster Versuch — 17:54 bis 18:11 — GESCHEITERT, zurückgerollt

**Ablauf:** Domain der App zugewiesen, Deploy für die Traefik-Route (17:53), Vorabprobe gegen
die Server-IP grün, DNS umgestellt (17:54). Danach lieferte die Domain **kein gültiges
Zertifikat** — Traefik antwortete mit `TRAEFIK DEFAULT CERT`, HTTPS scheiterte.
Rückrollung 18:10, wieder erreichbar 18:11.

**Ursache:** Traefik fordert das Zertifikat an, sobald die Route entsteht. Das war 17:53:46 und
17:53:56 — **vor** der DNS-Umstellung. Let's Encrypt rief
`http://business.activecenter.info/.well-known/acme-challenge/…` auf, landete dort noch bei
Vercel und bekam 404. Nach zwei Fehlschlägen ging Traefik in die Rückfallpause und fragte
in 16 Minuten nicht erneut an. Bei Stufe 2 hatte Traefik zufällig von selbst nachgefasst —
ein Verhalten, auf das der Plan sich verlassen hatte, ohne es je geprüft zu haben.

**Prüffehler, der es durchgehen liess:** Um 17:55 wurde das Zertifikat über den *Domainnamen*
geprüft und `CN=business.activecenter.info` als Erfolg gewertet. Das war **Vercels**
Zertifikat — der lokale DNS-Zwischenspeicher zeigte noch dorthin. Richtig ist, gegen die
**Server-IP mit Namenskennung** zu prüfen und die Zertifikatsausnahme (`curl -k`) wegzulassen.

**Gemessene Auswirkung:** 0 Ereignisse und 0 Leads im Ausfallfenster (Vergleichsfenster davor:
28 bzw. 5 Ereignisse, danach 29). Geschätzt zwei bis vier Besucher sahen eine
Zertifikatswarnung. Keine Datenverluste, keine halben Datensätze.

### Zweiter Versuch — 18:25 — ohne Ausfallsekunde

Vorher wurde der Proxy um einen **zweiten Prüfweg** ergänzt: `letsencryptdns` weist den Namen
über einen Cloudflare-DNS-Eintrag nach statt über einen Aufruf der Website. Damit lässt sich
ein Zertifikat beschaffen, **während die Domain noch woanders zeigt**.

| Schritt | Ergebnis |
| --- | --- |
| Cloudflare-Schlüssel geprüft (Eintrag anlegen + entfernen) | taugt; Account-Token, DNS Read+Edit auf allen Zonen |
| Sicherung `docker-compose.yml` + `acme.json` | `/data/coolify/proxy/backups/*.vor-dns01-20260825` |
| Proxy-Konfiguration ergänzt | **additiv**: neuer Auflöser, eigene Ablage `/traefik/acme-dns.json`; bestehender `letsencrypt` unverändert; Schlüssel in `.dns01.env` (Rechte 600), nicht in der 644er compose-Datei |
| Syntaxprüfung vor dem Neustart | gültig, beide Auflöser geladen |
| Proxy-Neustart | **11 Sekunden** Unterbrechung (4 von 113 Proben), danach alle 23 Apps gesund |
| Beweis am Wegwerf-Namen `cert-test.activecenter.info` (**ohne jeden DNS-Eintrag**) | Zertifikat nach **13 Sekunden**, korrekt per Namenskennung ausgeliefert |
| Zertifikat für die Werbedomain, während sie noch auf Vercel zeigte | nach **13 Sekunden** vorhanden und ausgeliefert |
| Vorabprobe **ohne** Zertifikatsausnahme | TLS-Verifikation 0, alle Routen erwartungsgemäß, CORS korrekt, Resume-Link über 14 Felder identisch zu Vercel |
| DNS-Umstellung 18:25 | **keine Lücke** |

Die 403-Antworten und Verbindungsabbrüche in der Messschleife tauchen in den Traefik-Logs
nicht auf — Vercel hatte die 2,7 Anfragen pro Sekunde gedrosselt. Messartefakt, kein Ausfall.

**Prüfkette nach dem Wechsel:** `router_check.py` unauffällig · alle drei Quiz-Domains
`health=200`, `markus=200`, keine mit `Server: Vercel` · alle 7 Nachbarn der Zone normal ·
alle 4 n8n-Workflows `success`, auch quer über den Wechsel ·
E2E-Testlead `qz_cd192fc9e80b4be4b3500a768dc680b0`: 97 Aufrufe, 0 Antworten ≥ 400,
94/94 Sitzung `match`, 3/3 Videos, 95 Ereignisse gespeichert, 0 Konsolenmeldungen zum
eigenen Host — Zeile für Zeile deckungsgleich mit Stufe 2.

---

## ✅ Aufgelöst am selben Abend: der Hilfs-Router ist wieder weg

Der unten beschriebene Zwischenzustand hat **von 18:24 bis 20:12** bestanden. Er ist
aufgelöst — nicht durch Überwachung eines Flickens, sondern durch Beseitigung des Flickens.

**Wie:** Coolify legt die von ihm erzeugten Traefik-Labels in einem **editierbaren** Feld der
Anwendung ab (`custom_labels`, base64). Dort wurde **genau eine Zeile** geändert:

```
traefik.http.routers.https-2-….tls.certresolver=letsencrypt
                                              → letsencryptdns
```

Damit fordert der **echte** Router der Anwendung das Zertifikat über die DNS-Prüfung an. Das
vorhandene Zertifikat liegt bereits in der Ablage genau dieses Auflösers — der Besitz
wechselt also, ohne dass ein neues bestellt werden muss und ohne eine Sekunde ohne
gültiges Zertifikat.

Die beiden anderen Domains bleiben unverändert auf der HTTP-Prüfung. Es gab keinen Grund,
funktionierende Zertifikate anzufassen.

**Geprüft, nicht angenommen:**

| Prüfung | Ergebnis |
| --- | --- |
| Änderung erzwingt genau eine Zeile | Schutz im Skript: bei ≠ 1 geänderter Zeile Abbruch |
| Label am laufenden Container | `https-2` = `letsencryptdns`, `https-0/1` unverändert |
| **Überlebt es einen weiteren Deploy?** | ja — Container **und** Coolify-Datenbank unverändert |
| Entfernen des Hilfs-Routers | 613 Proben, TLS durchgehend gültig, keine Fehler im Proxy |
| Zertifikatsbesitz danach | liegt in `acme-dns.json`, referenziert vom regulären App-Router |

⚠️ **Ein Restrisiko bleibt und gehört benannt:** Ändert jemand die **Domainliste** dieser
Anwendung, erzeugt Coolify die Labels neu und setzt `certresolver` vermutlich auf
`letsencrypt` zurück. Dann müsste die Zeile erneut gesetzt werden. Das Netz darunter ist die
seit heute laufende `ZERT`-Prüfung im stündlichen Domain-Sweep (`Coolify/BETRIEB.md`), die
lange vor einem Ausfall anschlägt.

Der entfernte Hilfs-Router liegt gesichert unter
`/data/coolify/proxy/backups/zzz-zertifikat-business.yaml.entfernt-20260825`.

### Korrektur: Deploys sind sehr wohl ausfallfrei

Beim Setzen des Labels wurden 20:03:13–20:03:19 rund **6 Sekunden HTTP 503** gemessen. Das
wurde hier zunächst als Eigenschaft der rollenden Aktualisierung festgehalten. **Das war
falsch**, und die Messung selbst enthielt schon den Widerspruch: Die 503 trafen
**ausschliesslich** `business.activecenter.info`, während `quiz.activecenter.info` und
`business.eaglesfit.ch` durchgehend 200 lieferten — obwohl alle drei am **selben Container**
hängen. Eine Container-Umschaltung hätte alle drei gleichzeitig getroffen.

Gegenprobe um 20:25 mit einem Deploy **ohne jede Konfigurationsänderung**, durchgehende
Messung aller drei Domains, 375 Proben über fünf Minuten:

| | |
| --- | --- |
| HTTP 503 | **kein einziges Mal** |
| Verbindungsabbrüche | 4, verteilt über 5 Minuten, jedes Mal auf einer **anderen** Domain, nie gleichzeitig |
| davon im Umschaltfenster (Container-Start 20:25:18) | genau **einer** — die übrigen drei liegen unabhängig davon |

Die Proben laufen nacheinander (je ~300 ms), ein Klemmer unter einer Sekunde trifft deshalb
nur eine Domain. Das Grundrauschen der Messung liegt bei rund einem Ausreisser je 90
Sekunden — die vier Werte liegen darin.

**Fazit: Die rollende Aktualisierung arbeitet wie vorgesehen** — neuer Container starten,
Gesundheitsprüfung abwarten, erst dann den alten entfernen (im Deploy-Protokoll wörtlich
nachlesbar). Die 6 Sekunden entstanden, weil Traefik den Router `https-2` wegen des
**geänderten TLS-Auflösers** neu bauen musste; währenddessen gab es für diesen einen
Hostnamen keine Route, und der Catch-all antwortete mit 503.

Das ist kein Deploy-Verhalten, sondern der Preis einer Router-Umkonfiguration — ein Vorgang,
der im Normalbetrieb nicht vorkommt. **Es gibt hier nichts einzurichten.**

---

## Zwischenzustand 18:24–20:12 (aufgelöst, zur Nachvollziehbarkeit erhalten)

Das Zertifikat für `business.activecenter.info` liegt **ausschliesslich** in
`acme-dns.json`. Der reguläre, von Coolify erzeugte Router benutzt weiterhin die
HTTP-Prüfung und hat **nie** ein eigenes Zertifikat bekommen (letzte Fehlversuche 18:24,
danach keine mehr).

Erneuert wird das Zertifikat also durch
`/data/coolify/proxy/dynamic/zzz-zertifikat-business.yaml`.

**Wird diese Datei gelöscht, bricht HTTPS auf der Werbedomain — nicht sofort, sondern
etwa 60 Tage später bei der Erneuerung.** Genau die Sorte Fehler, die keine Prüfung
bemerkt, weil im Moment des Löschens alles grün ist.

**Gemessen, nicht vermutet:** Um 19:14 wurde ein Deploy angestoßen, damit der reguläre Router
sein eigenes Zertifikat holt — jetzt, wo die Domain hierher zeigt, würde die HTTP-Prüfung
gelingen. Er hat **nicht** angefragt: Traefik findet bereits ein gültiges Zertifikat für den
Namen im Speicher und bestellt deshalb keins. Vernünftiges Verhalten, aber es heißt, dass der
Sonderfall sich nicht von selbst auflöst.

Ihn aufzulösen hieße, das vorhandene Zertifikat aus `acme-dns.json` zu entfernen — und dafür
müsste Traefik gestoppt werden, was alle 23 Apps trifft. Das Risiko steht in keinem
Verhältnis zum Gewinn.

**Entschieden: Der Hilfs-Router bleibt.** Offen bleibt damit eine Überwachungslücke:

- Es gibt **nirgends** eine Prüfung der Zertifikats-Restlaufzeit — weder in
  `sites-health.js` noch in `verify.py` noch im `router_check.py`.
- Die SITES-Überwachung würde einen Ablauf zwar bemerken, aber **erst wenn er eingetreten
  ist** — der HTTPS-Aufruf scheitert dann. Eine Vorwarnung gibt es nicht.
- Nächste Erneuerung: etwa 24.10.2026 (30 Tage vor Ablauf am 23.11.2026).

**Nächster Schritt (noch offen):** Restlaufzeit-Prüfung für alle Domains ergänzen, die
deutlich vor Ablauf anschlägt. Bis dahin gilt: **`zzz-zertifikat-business.yaml` nicht
anfassen.**

---

## Was dieser Cutover nicht anfasst

Kein Datenumzug, keine Kysely-Umstellung, keine Änderung an n8n, Mautic, Meta, Postmark oder
der PHP-Bridge. Vercel bleibt lauffähig; der vierte, DNS-unabhängige Eingang
`businessleadsquiz.vercel.app` bleibt bewusst bestehen und wird erst im Nachlauf entfernt,
wenn der Hosting-Wechsel 48 Stunden ohne Vorfall gelaufen ist.

## Rückweg

Ein einziger DNS-Wert je Domain, zurück auf den in den `dns-rollback-*.json` gesicherten
Stand. TTL 60 heißt: nach spätestens einer Minute greift der alte Weg wieder. Vercel wird
7 bis 14 Tage nicht angefasst.
