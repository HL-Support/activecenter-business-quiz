# Übergabe an das **Umfragen**-Projekt — Befunde vom 31.08.2026

Erhoben aus `business_leads_quiz` heraus, weil euer Aufbau uns als **Vorbild** dient: Das
Quiz koppelt sich von der alten Route `/webhook/typeform` ab und baut nach eurem Muster
eine eigene Route. Beim genauen Lesen sind sechs Punkte aufgefallen.

> **Vorweg, ehrlich gemeint:** Der Aufbau ist gut. Die per Linter erzwungene
> `legacy/`-Grenze, die `SECURITY DEFINER`-Views statt breiter Rechte auf `users`, die
> Idempotenz per `submissionId`, das Zustellprotokoll vor dem Senden in `safely()` — das
> übernehmen wir. Die Punkte unten sind Feinschliff, kein Umbau.
>
> **Herkunft:** Punkte 1, 5 und 6 habe ich selbst im Quelltext nachgesehen. Punkte 2–4
> stammen aus einer Detailanalyse eures Repos und sind mit Fundstelle angegeben, damit ihr
> sie gegenprüfen könnt.

---

## 1. 🔴 Das Webhook-Geheimnis wirkt nur, weil der Empfänger es *nicht* prüft, wie ihr denkt

**Selbst nachgesehen.** Ihr setzt `TYPEFORM_WEBHOOK_SECRET` in eurer Coolify-App korrekt.
Die Gegenstelle `contacts` setzt es **nicht** und fällt auf einen **Klartextwert aus ihrem
Repository** zurück (`contacts…/config/typeform.php:18`). Eure Signatur wird also gegen ein
Geheimnis geprüft, das öffentlich im Quelltext und in der Git-Historie steht. Zusätzlich ist
die Prüfung dort **fail-open**: fehlt der Wert, wird gar nicht geprüft
(`app/Services/Typeform/Webhook.php:112-118`).

**Das ist kein Fehler in eurem Code** — aber es entwertet eure Signatur. Einzelheiten und
Reihenfolge zur Behebung stehen in der Übergabe
`2026-08-31-contacts-signaturpruefung.md`, die ans contacts-Projekt geht.

**Bitte an euch:** Beim Angleichen mitziehen und darauf bestehen, dass **jede Route ein
eigenes Geheimnis** bekommt statt eines geteilten. *(Bei euch als „Punkt 108" bereits
notiert — hier ist der gemessene Nachweis dazu.)*

**Nebenbei zur Benennung:** Der Name `TYPEFORM_*` ist ein Erbstück; mit Typeform hat der Weg
nichts mehr zu tun. Wenn ihr ohnehin rotiert, wäre das der Moment, sprechend umzubenennen.

---

## 2. `coach_uuid` in der View ist ein Schlüssel, keine Kennung

**Fundstelle:** `sql/views.sql:71-94`.

Ihr habt die Abwägung **vorbildlich ausgeschrieben** — inklusive des Hinweises, dass damit
Gutscheine für alle 255 Berater angelegt werden können, und der Warnung, keine
Formatprüfung einzubauen (147 Hex-UUIDs vs. 108 Kurzketten). Das ist dokumentiert, nicht
übersehen.

**Trotzdem als Anregung:** Sobald Schritt 4 durch ist und der HMAC-Weg wegfällt, wäre die
Frage, ob die UUID in *derselben* View bleiben muss wie die Stammdaten. Eine zweite,
enge View nur für den Gutschein-Weg würde die Stammdaten-View wieder zu reinen Stammdaten
machen — dann kann sie gefahrlos für andere Zwecke geöffnet werden, ohne einen Schlüssel
mitzugeben. **Wir übernehmen die View-Technik fürs Quiz ausdrücklich ohne diese Spalte.**

---

## 3. Kein automatischer Wiederholungsversuch bei 5xx — der Teilnehmer sieht 502

**Fundstelle:** bewusste Entscheidung, ersetzt durch Sendewache im Frontend + Idempotenz.

Für euren Fall ist das vertretbar. **Anregung:** Da die Idempotenz per `submissionId`
ohnehin trägt, wäre ein einzelner serverseitiger Wiederholungsversuch nach kurzer Wartezeit
gefahrlos und würde die meisten Wackler auffangen, bevor der Teilnehmer überhaupt etwas
merkt. Nicht mehr als einer — sonst verdeckt man echte Ausfälle.

*(Für das Quiz gilt das nicht: dort gibt es bereits eine Outbox mit Wiederholung. Wir
behalten sie und hängen eure Route dahinter.)*

---

## 4. Musterduplikation statt geteiltem Paket

`analysen/legacy/*.js` (CommonJS) und `Umfragen/src/legacy/*.ts` (TypeScript) sind
**dieselbe Konstruktion zweimal**. Gleiche Eckwerte, gleiche Entscheidungen — aber zwei
Fassungen, die auseinanderdriften können. Ein Beispiel dafür ist Punkt 5 unten.

**Ehrliche Einschätzung:** Ein gemeinsames Paket über zwei Sprachen (TS und CJS) und drei
Projekte lohnt sich vermutlich **nicht** — der Abstimmungsaufwand wäre grösser als der
Nutzen, und die Grenze ist ja gerade der Sinn der Sache. Realistischer wäre, das **Muster**
zu dokumentieren (eine Seite: Pool-Eckwerte, Zeitlimits, HMAC, Idempotenz, Protokoll,
Lint-Grenze) und in jedem Projekt darauf zu verweisen. Wir tun für das Quiz genau das.

---

## 5. Veralteter Kommentar in `src/legacy/datenbank.ts:38-42`

**Selbst nachgesehen.** Dort steht:

> *„Fehlt einer der drei Werte, gibt es keinen Pool — und die Aufrufer fallen auf die
> PHP-Bridge zurück."*

Der Rückfall auf die Bridge ist entfernt worden; bei fehlender Konfiguration sieht der
Nutzer „Link nicht gültig" und `melden()` schlägt an. Der Kommentar beschreibt also ein
Verhalten, das es nicht mehr gibt — genau die Stelle, an der jemand später eine falsche
Annahme trifft. **Vorschlag:** Kommentar auf den heutigen Stand ziehen.

---

## 6. Toter Code `buildPayload` in `src/server/payload.ts`

**Selbst nachgesehen** — die Datei dokumentiert sich selbst als überholt (`payload.ts:11`),
und ihr führt das in `BETRIEB.md:533-536`. **Vorschlag:** löschen. Eine Datei, die nur noch
erklärt, warum sie nicht mehr gebraucht wird, ist Dokumentation — die gehört in die Doku,
nicht in `src/`.

---

## Was wir von euch übernehmen (als Rückmeldung, dass es sich gelohnt hat)

- `legacy/` als einzige Tür nach draussen, per Linter erzwungen
- `SECURITY DEFINER`-Views statt Leserecht auf `users`
- HMAC über den **exakten rohen** Body
- Idempotenz per Client-UUID + Unique-Index, Antwort mit `duplicate`-Kennzeichen
- Zustellprotokoll **vor** dem Senden, `attempt_count` per `ON DUPLICATE KEY`, in `safely()`
- Das Paar-Format für Frage und Antwort — und der Grund dafür (die Index-Paarung der alten
  Route verrutscht ab der ersten übersprungenen Frage)
- Notausstieg per Env-Variable ohne Deploy

**Nicht übernehmen** wir das Weglassen des serverseitigen Wiederholungswegs — siehe Punkt 3.
