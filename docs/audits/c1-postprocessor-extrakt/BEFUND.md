# C1 Schritt 1 — Die Vorlagenbibliothek des Post Processors, gemessen

**Erhoben 30.08.2026** am laufenden Workflow `AC - Lead Post Processor - Business Leads Quiz`
(`9RZdrLxfA8IRhd55`, aktiv, 36 Knoten). Erfüllt Schritt 1 aus
[../../plans/benachrichtigungsweg-auf-plattform.md](../../plans/benachrichtigungsweg-auf-plattform.md):
*„die drei Kopien aus n8n ziehen, diffen, die eine echte Fassung feststellen"*.

Beweisanforderung des Plans: **„Die drei Kopien sind zeichengleich — oder die Abweichungen
sind benannt."** Sie sind **nicht** zeichengleich. Hier sind die Abweichungen.

---

## 1. Das Ergebnis in einem Satz

Es sind nicht „drei Kopien von 87.000 Zeichen", sondern **eine Bibliothek von 1.708 Zeilen
und drei Treiber von 3, 4 und 47 Zeilen**. Der Umbau ist damit erheblich kleiner als der
Plan am 28.08. annehmen musste.

| Knoten | Zeichen | davon Bibliothek | eigener Treiber |
| --- | --- | --- | --- |
| `Code - Normalize Candidate Rows` | 87.526 | 1.695 Zeilen | **3 Zeilen** |
| `Code - Build Lead Model` | 87.932 | 1.708 Zeilen | **4 Zeilen** |
| `Code - Apply Resume Link` | 89.050 | 1.695 Zeilen | **47 Zeilen** |

Die Bibliothek enthält **53 Funktionen** — Betreff, HTML, Text, Profil- und Zielnamen für
`de`/`it`/`en`/`hu`. Die Treiber rufen ausschließlich Bibliotheksfunktionen; die einzige
Ausnahme ist `first`, und das ist n8n (`$input.first()`), keine eigene Funktion.

## 2. 🔴 Die drei Kopien sind auseinandergelaufen

Prüfsumme über die Bibliothekszeilen 1–1695:

| Knoten | sha256 (Anfang) | |
| --- | --- | --- |
| `Normalize Candidate Rows` | `40b9fa742efd5680` | ← identisch |
| `Apply Resume Link` | `40b9fa742efd5680` | ← identisch |
| `Build Lead Model` | `bb5c701f736ccb88` | **abweichend, neuer** |

`Build Lead Model` hat **13 Zeilen mehr** (`toDisplayNamePart`, `buildCoachDisplayName`) und
eine geänderte Zeile im Mautic-Nutzdatensatz:

```diff
-    ac_berater_org_display: ((model.coach_organisation_name || 'Activecenter').toUpperCase() === 'ACTIVECENTER' ? 'Activecenter' : model.coach_organisation_name)
+    ac_berater_org_display: getOrganisationName(model),
+    ac_berater_display_name: buildCoachDisplayName(model)
```

Die beiden anderen Kopien setzen `ac_berater_display_name` **gar nicht** und rechnen den
Organisationsnamen noch von Hand aus. Sie sind die alte Fassung.

**Die maßgebliche Fassung ist die aus `Code - Build Lead Model`.** Sie liegt hier als
[bibliothek.js](bibliothek.js).

## 3. Warum die Drift heute nichts kaputtmacht — und warum sie trotzdem weg muss

Der Workflow hat zwei Zweige:

```text
Schedule → Set Config ─┬─ MySQL Select New Candidate Surveys
                       │     → Code - Normalize Candidate Rows   ← alte Bibliothek
                       │         → MySQL Insert Pending Jobs
                       └─ Code - Continue To Claim
                             → MySQL Claim/Load Jobs → Split In Batches
                                → MySQL Re-Read Final Lead Context
                                → Code - Build Lead Model         ← neue Bibliothek
                                → HTTP Generate Resume Token
                                → Code - Apply Resume Link        ← alte Bibliothek
                                → Mautic · ZeroBounce · 2× Postmark
```

`Normalize Candidate Rows` baut das **vollständige** Lead-Modell samt HTML-Mails und
Mautic-Nutzdaten — und `MySQL - Insert Pending Jobs` verwendet davon **17 skalare Felder**
(Umfrage-, Kontakt-, Coach- und Mitglieds-ID, Formular, Hashes, Token, Funnel, Sprache,
Zeitstempel, zwei Adressen). Kein einziges der abgedrifteten Felder wird benutzt. Deshalb
ist die alte Bibliothek dort **heute** folgenlos.

`Apply Resume Link` baut sein Modell aus `$('Code - Build Lead Model')` neu auf und ergänzt
nur Resume-Felder, bevor es `buildPremiumLeadEmailHtml`/`-Text` erneut aufruft. Die aus der
neuen Fassung stammenden Mautic-Felder überleben dabei. **Die versendete Mail entsteht
allerdings in der alten Bibliothek** — sie ist an dieser Stelle nur zufällig gleichwertig,
weil sich zwischen den Fassungen nichts an den Mailtexten geändert hat.

🔴 **Das ist eine geladene Falle.** Die nächste Änderung an den Mailtexten trifft
zwangsläufig nur eine der beiden Fassungen. Genau diese Fehlerklasse hat dieses Projekt
schon getroffen ([[bridge-helfer-doppelt-void-rpc]]).

## 4. Zweiter Befund: ein Knoten arbeitet hundertfach umsonst

`Normalize Candidate Rows` und `Build Lead Model` haben **denselben Treiber**:

```js
return items.map(({ json }) => ({
  json: buildLeadModel(json, { videoBaseUrl: 'https://business.activecenter.info' }),
}));
```

Der erste erzeugt also je Kandidat vier Sprachfassungen von Betreff, HTML und Text, um
danach 17 Zahlen und Zeichenketten in eine Auftragszeile zu schreiben. Für den Port heißt
das: Dieser Aufruf braucht **keine** Vorlagenbibliothek, nur einen schlanken Feldauszug.

## 5. Was daraus für Schritt 2 folgt

| | Annahme im Plan (28.08.) | gemessen (30.08.) |
| --- | --- | --- |
| Umfang | „rund 87.000 Zeichen Vorlagenlogik" dreifach | **eine** Bibliothek, 1.708 Zeilen |
| Treiber | unklar | 3 / 4 / 47 Zeilen, benannt |
| Fassungsstand | unklar | zwei Fassungen, die neuere benannt |
| Nebenbefund | — | ein Knoten baut Mails, die niemand liest |

Schritt 2 (Port nach `server/mail-vorlagen/` mit Golden-Tests gegen echte Postmark-Mails)
kann damit gegen **eine** Fassung arbeiten. Die Golden-Tests müssen je Sprache einen echten
Lead abdecken — `hu` ist dabei der dünnste Fall, weil die Nurture-Strecke für Ungarisch gar
keine Vorlagen hat (`unsupported_language:hu`, 3 Menschen am 30.08.).

## 6. Dateien in diesem Verzeichnis

| Datei | Inhalt |
| --- | --- |
| `bibliothek.js` | die maßgebliche Fassung, 1.708 Zeilen, 53 Funktionen |
| `treiber-1-normalize-candidate-rows.js` | 3 Zeilen |
| `treiber-2-build-lead-model.js` | 4 Zeilen |
| `treiber-3-apply-resume-link.js` | 47 Zeilen |
| `MANIFEST.sha256` | Prüfsummen |

🔴 **Das ist ein Extrakt, kein Port.** Der Code läuft hier nicht und wird von nichts
aufgerufen; er ist die geprüfte Ausgangslage für Schritt 2. Der Workflow ist unverändert —
an ihm wurde für diese Erhebung **nichts** geschrieben, nur gelesen.
