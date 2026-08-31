# 🔴 Übergabe an das **contacts**-Projekt — Signaturprüfung der Webhook-Routen

**Erhoben am 31.08.2026** aus dem Projekt `business_leads_quiz` heraus, im Zuge der
Vorbereitung einer eigenen Quiz-Route. **Alles unten habe ich selbst im Quelltext und an
der laufenden Coolify-Konfiguration nachgesehen** — es ist keine Weitergabe fremder
Behauptungen.

> **Betrifft:** `contacts-activecenter-legacy` (Empfänger).
> **Wirkt auf:** alle Absender — `Umfragen` (`/webhook/survey`), `analysen`
> (`/webhook/assessment`), das Erfolgscode-Quiz (`/webhook/typeform`) und die 12 weiteren
> Formulare an der alten Route.
>
> ⚠️ Dieses Dokument nennt **keine Geheimniswerte**. Es nennt nur Fundstellen.

---

## Befund 1 — Das Webhook-Geheimnis steht im Klartext im Repo und ist in Produktion **nicht** überschrieben

**Beleg, selbst gelesen:**

- `config/typeform.php:18` — `'secret' => env('TYPEFORM_WEBHOOK_SECRET', '<16-stelliger Klartextwert>')`
- `app/Services/Typeform/Webhook.php:61` — `getWebhookSecret()` liefert `config('typeform.webhook.secret')`
- `app/Http/Controllers/External/SurveyWebhookController.php:48` und
  `AssessmentWebhookController.php:37` — **beide neuen Routen** rufen
  `(new Webhook())->validatePayload($request)`, also **dasselbe** Geheimnis
- Coolify-App `contacts` (`ivvm0jpwozcczqokby0ty4yb`, `running:healthy`): gesetzte Env-Werte
  mit „SECRET"/„WEBHOOK" im Namen sind **`POSTMARK_SECRET`, `AWS_SECRET_ACCESS_KEY`,
  `PUSHER_APP_SECRET`** — **`TYPEFORM_WEBHOOK_SECRET` ist nicht dabei.**

**Was daraus folgt:** Der Empfänger prüft **gegen den Vorgabewert aus dem Repository**.
Das Geheimnis ist damit kein Geheimnis: Es liegt im Quelltext und in der gesamten
Git-Historie. Zum Vergleich — die Absender setzen ihres sehr wohl:
`umfragen` hat `TYPEFORM_WEBHOOK_SECRET` gesetzt, `analysen` hat
`TYPEFORM_WELLNESS_WEBHOOK_SECRET` gesetzt.

**Warum das zählt:** Wer den Wert kennt, kann an *jeder* dieser Routen gültig signierte
Nutzdaten einliefern — Kontakte anlegen, Karteizeilen erzeugen, dadurch Mails auslösen.

**Vorschlag:**
1. Den Vorgabewert aus `config/typeform.php:18` entfernen (auf `null`), damit ein fehlender
   Wert auffällt statt still zu greifen — **zusammen mit Befund 2**, sonst öffnet man die
   Routen.
2. `TYPEFORM_WEBHOOK_SECRET` in der Coolify-App `contacts` setzen und bei allen Absendern
   gleichziehen. Reihenfolge: erst Empfänger *beide* Werte akzeptieren lassen, dann
   Absender umstellen, dann alten Wert entfernen — sonst brechen laufende Formulare ab.
3. **Je Route ein eigenes Geheimnis.** Heute teilen sich mindestens drei Anwendungen eins;
   eine Rotation trifft alle gleichzeitig. Neue Routen sollten einen eigenen Konfigwert
   bekommen (z. B. `webhook.secrets.<route>`).
4. Den kompromittierten Wert nach der Umstellung als verbrannt behandeln — er steht in der
   Historie und lässt sich dort nicht wegdrücken.

*(In der Projektdokumentation ist das als „Punkt 108" bereits vermerkt — hier ist der
gemessene Nachweis, dass es in Produktion tatsächlich so steht.)*

---

## Befund 2 — 🔴 Die Prüfung ist **fail-open**: kein Geheimnis ⇒ keine Prüfung

**Beleg, selbst gelesen** — `app/Services/Typeform/Webhook.php:112-118`:

```php
public function validatePayload(Request $request)
{
    $secret = $this->getWebhookSecret();
    if (!$secret) {
        // no secret => no need to validate
        return;                     // <-- akzeptiert ALLES
    }
    ...
```

**Warum das zählt:** Ein leerer oder fehlender Konfigwert schaltet die Signaturprüfung
**vollständig ab**, ohne Fehler und ohne Protokolleintrag. Alle Routen, die
`validatePayload` benutzen, nehmen dann unsignierte Daten an.

Heute maskiert der Klartext-Vorgabewert aus Befund 1 diesen Zustand. **Genau deshalb sind
die beiden Befunde gekoppelt:** Wer Befund 1 „richtig" behebt, indem er den Vorgabewert
entfernt, ohne die Env-Variable zu setzen, öffnet damit alle Webhook-Routen.

**Vorschlag:** Fail-closed machen. Fehlt das Geheimnis, soll die Route mit `503` antworten
und einen Fehler melden — nicht durchwinken. Das Umfragen-Projekt hält es an seinem Ende
bereits so: *„Ohne diesen Wert nimmt die Route gar nichts an und antwortet 503."* Der
Empfänger sollte dieselbe Haltung haben.

---

## Befund 3 — Die alte Route `/webhook/typeform` prüft in der Praxis nicht scharf

**Beleg:** im Quelltext von `SurveyWebhookController.php:23-28` als Schattenbetrieb-Befund
vermerkt; an ihr hängen laut demselben Kommentar **13 fremde Formulare mit über 1400
Übermittlungen in 60 Tagen**.

**Kein Handlungsbedarf für euch** — nur zur Einordnung: Das Erfolgscode-Quiz (mit 698
Übermittlungen der grösste Absender dort) **koppelt sich ab** und bekommt eine eigene Route
mit eigenem Geheimnis und scharfer Prüfung. Der Wellnesscheck (580) wird laut Markus in
etwa zwei Monaten abgeschaltet; danach übernimmt die neue Vitalanalyse alles. **Damit
verliert die alte Route in absehbarer Zeit ihre beiden grössten Nutzer** — ein guter
Zeitpunkt, sie danach ganz stillzulegen.

---

## Reihenfolge, wenn ihr es anfasst

1. Befund 2 zuerst vorbereiten (fail-closed **und** Env gesetzt), sonst öffnet Schritt 2 die Tür.
2. Befund 1: Env in `contacts` setzen, Absender angleichen, Vorgabewert entfernen.
3. Danach je Route eigene Geheimnisse einführen.

🔴 **Nicht am selben Tag wie andere Eingriffe in den Übermittlungsweg.** Zwei Änderungen
gleichzeitig an einem Pfad ist die Fehlerklasse, die in diesem Verbund schon mehrfach
zugeschlagen hat.
