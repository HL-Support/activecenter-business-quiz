# Übergabe an das **analysen**-Projekt — Befunde vom 31.08.2026

Erhoben aus `business_leads_quiz` heraus. Euer `legacy/`-Ordner ist die Vorlage, nach der
wir bauen — er ist in CommonJS geschrieben und passt damit direkt auf unsere Codebasis.
Vier Punkte sind beim genauen Lesen aufgefallen.

> **Herkunft:** Punkte 2 und 3 habe ich selbst im Quelltext nachgesehen. Punkte 1 und 4
> stammen aus einer Detailanalyse eures Repos und tragen Fundstellen zum Gegenprüfen.

---

## 1. 🔴 Eure Signatur wird gegen ein öffentlich bekanntes Geheimnis geprüft

**Selbst nachgesehen, an der laufenden Konfiguration.** Ihr setzt
`TYPEFORM_WELLNESS_WEBHOOK_SECRET` in eurer Coolify-App korrekt. Die Gegenstelle `contacts`
setzt **kein** `TYPEFORM_WEBHOOK_SECRET` und fällt auf einen **Klartextwert aus ihrem
Repository** zurück (`contacts…/config/typeform.php:18`).

Und: `AssessmentWebhookController.php:37` ruft dieselbe
`(new Webhook())->validatePayload($request)` wie alle anderen Routen — es ist also
**dasselbe** Geheimnis für `/webhook/assessment`, `/webhook/survey` und die alte Route.
Zusätzlich ist die Prüfung **fail-open**: fehlt der Wert, wird gar nicht geprüft
(`Webhook.php:112-118`).

**Kein Fehler in eurem Code**, aber eure Signatur ist damit kein wirksamer Schutz.
Einzelheiten, Reihenfolge und die Kopplung der beiden Befunde stehen in
`2026-08-31-contacts-signaturpruefung.md` (geht ans contacts-Projekt).

**Bitte an euch:** auf **eigene Geheimnisse je Route** bestehen. In eurer Doku ist die
offene Rotation bereits vermerkt (`CONTACTS-INTEGRATION.md:214-216`) — hier ist der
gemessene Nachweis, wie es in Produktion tatsächlich steht.

---

## 2. Ziel-URL als harter Vorgabewert im Code

**Selbst nachgesehen** — `legacy/kontakte.js:15`:

```js
const DEFAULT_WEBHOOK_URL = "https://contacts.hl-support.biz/webhook/assessment";
```

Es gibt einen Env-Übersteuerungsweg, der Vorgabewert greift also nur, wenn nichts gesetzt
ist. **Trotzdem zwei Nachteile:** In einer Testumgebung ohne gesetzte Variable zeigt der
Weg still auf **Produktion**, und der Wert ist an zwei Orten (Code und Coolify) zu pflegen.

**Vorschlag:** Wie beim Datenbankzugang halten — fehlt die Variable, gibt es keinen Weg
(sprechender Fehler statt stiller Vorgabe). Das passt auch besser zu eurem eigenen
Grundsatz des Notausstiegs per Env.

---

## 3. Das Zustellprotokoll bricht ohne `submissionId` still ab

**Selbst nachgesehen** — `legacy/zustellprotokoll.js:57`:

```js
if (!record.submission_id) return null;
```

Fehlt die Kennung, entsteht **keine Protokollzeile** — und zwar ohne Fehler, ohne Meldung.
Die Übermittlung läuft weiter. Genau so ist bei euch der dokumentierte „blinde Tag"
entstanden (Historie in `zustellprotokoll.js:25-28`).

Das Muster „ein Protokoll ist nie ein Datenpfad" ist richtig und soll bleiben. **Aber
stilles Aussteigen und ausbleibendes Protokoll sehen im Nachhinein identisch aus** — man
kann nicht unterscheiden, ob nichts gesendet wurde oder ob nur das Protokoll fehlte.

**Vorschlag:** Den Frühausstieg an GlitchTip melden (über euren Melder, der ja nie wirft und
nie wartet). Dann bleibt der Datenpfad unangetastet, aber der blinde Fleck wird sichtbar,
während er entsteht.

---

## 4. Kein serverseitiger Wiederholungsweg / keine Outbox

Bewusst so entschieden — ersetzt durch die Sendewache im Frontend plus Idempotenz. Für euren
Fall tragfähig, und die Sendewache ist eine gute Lösung.

**Anregung:** Da die Idempotenz ohnehin trägt, wäre **ein** serverseitiger
Wiederholungsversuch nach kurzer Wartezeit gefahrlos und würde kurze Wackler der Gegenstelle
auffangen, bevor der Teilnehmer ein 502 sieht. Nicht mehr als einer — sonst verdeckt man
echte Ausfälle.

*(Für uns gilt das umgekehrt: Das Quiz hat mit `api/lead-outbox-worker.js` bereits eine
Outbox. Wir behalten sie und hängen die neue Route dahinter — eure Konstruktion ohne
Outbox wäre für uns ein Rückschritt.)*

---

## Was wir von euch übernehmen

- Der `legacy/`-Ordner als einzige Tür nach draussen — **und `scripts/lint.js:29-50`, das
  die Grenze erzwingt.** Das ist der beste Einzelgedanke aus beiden Projekten.
- `legacy/datenbank.js`: Pool 5, `connectTimeout` 8 s, `timezone:"Z"`, bewusst **ohne**
  Standard-Datenbank (vollqualifizierte Namen), `query()` statt `execute()`
- Views statt Leserecht auf `users` (`legacy/berater.js:6-10`)
- Der Webhook als **einziger** Schreibweg ins Altsystem — nie an der Verarbeitungsreihenfolge
  vorbei
- Der Melder ohne SDK mit den drei Pflichteigenschaften: wirft nie, wartet nie, flutet nie
- „Danebengebaut, nicht geändert" — eigene Route, alte unangetastet

---

## Zur Einordnung: die alte Route verliert bald ihre beiden grössten Nutzer

> 🔴 **Nachgemessen am 31.08.2026 — die Zahl aus dem Quelltextkommentar ist überholt.**
> Am Bestand ausgezählt (60 Tage, `typeform_surveys`): Die grossen Absender liegen längst
> auf den **neuen** Routen. Auf der alten ist nur noch das Quiz wirklich aktiv.
>
> | Formular | Übermittlungen | Weg |
> | --- | --- | --- |
> | Vitalanalyse `Dw4acDUx` | 711 | `/webhook/assessment` |
> | **Erfolgscode-Quiz `hC2yTcU8`** | **679** | 🔴 alt — unseres |
> | Umfragen Lifestyle `lLS1eAMh` | 202 | `/webhook/survey` |
> | Hautanalyse `zlWcZxat` | 127 | `/webhook/assessment` |
> | 13 weitere Kennungen | zusammen **60** | alt, meist zuletzt im Juli |

Der Quelltextkommentar in `SurveyWebhookController.php:17-21` nennt noch 13 fremde Formulare
mit über 1400 Übermittlungen. Das stimmte, als er geschrieben wurde — inzwischen sind die
grossen Absender auf euren und unseren neuen Routen.

- Das Quiz koppelt sich ab und bekommt eine eigene Route — Plan liegt vor.
- Der Wellnesscheck ist die **alte Vitalanalyse** und wird laut Markus in etwa zwei Monaten
  abgeschaltet; danach macht alles die neue Vitalanalyse.

**Danach ist die alte Route fast leer.** Das wäre der Moment, sie stillzulegen — und ein
Argument, die verbleibenden kleinen Absender jetzt schon zu erfassen.
