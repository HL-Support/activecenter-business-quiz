# Strang M — Mail 1 und Mail 2 ins Projekt holen, dann den Poller abschalten

**Aufgestellt am 31.08.2026** (Entscheidung Markus vom selben Tag: *alles Lead-Bezogene wird
im Repo verwaltet — Zustand, Outbox, ALLE Mails, Nurture-Auslöser; mit dem Altsystem wird
nur noch das Nötigste ausgetauscht*). Zeiten MESZ.

> **Es ist nichts geändert worden.** Dieses Dokument ist ausschliesslich Plan. Alle
> Fundstellen sind am 31.08.2026 am Quelltext, an den im Repo liegenden
> Workflow-Sicherungen und an den gemessenen Dokumenten (`MAILWEGE.md`, `BEFUND.md`)
> belegt; wo etwas nicht belegt ist, steht es ausdrücklich in §12.

🔴 **Zur Nummerierung:** Die Schritte heissen **M1, M2, M3, …** — bewusst **nicht** C1/C2/C3.
„C1" ist im Repo bereits vergeben: der Postprozessor-**Extrakt** aus
[benachrichtigungsweg-auf-plattform.md](benachrichtigungsweg-auf-plattform.md) und
[../audits/c1-postprocessor-extrakt/BEFUND.md](../audits/c1-postprocessor-extrakt/BEFUND.md).
Eine Doppelbelegung wäre eine Falle.

**Verhältnis zu den bestehenden Plänen:**

| Plan | Verhältnis |
| --- | --- |
| [bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md) | Dort ist dieses Vorhaben als „Strang C" (§6) skizziert. **Dieses Dokument arbeitet ihn aus und benennt ihn M.** |
| [benachrichtigungsweg-auf-plattform.md](benachrichtigungsweg-auf-plattform.md) | Dessen Schritte 2–7 (§4) gehen in M auf; **dieses Dokument ersetzt sie als Arbeitsgrundlage**. Schritt 1 (Extrakt) ist erledigt und bleibt Referenz. Die dortige B-Reihe (Berateridentität, B1–B4) ist ein **eigenes**, bereits laufendes Vorhaben — nicht Teil von M, aber Zulieferer (§10). |
| [../MAILWEGE.md](../MAILWEGE.md) | Die gemessene Karte der fünf Mails. M ändert Mail 1 und 2; Mail 3, 4, 5 bleiben unberührt. Nach M7 ist `MAILWEGE.md` zu korrigieren (M8). |

---

## 1. Ist-Zustand: nicht zwei Wege, sondern drei

Am Opt-in- und Rangweg des Quiz arbeiten heute **drei** getrennte Maschinen. Alle drei sind
am 31.08.2026 aktiv gemessen:

```text
Weg 1 — Opt-in (Mail 1 + 2), der Poller:
  Quiz-Submit → api/bridge.js forward_typeform_adapter (api/bridge.js:4057)
    → forward_webhook → alte PHP-Bridge → contacts.hl-support.biz/webhook/typeform
    → MySQL prod_contacts_activesupport.typeform_surveys
    → [bis 5 Min] n8n „AC - Lead Post Processor - Business Leads Quiz“
      (9RZdrLxfA8IRhd55, aktiv, 36 Knoten, Takt 5 Min)
    → Jobs in lead_processing_jobs → Resume-Token per HTTP zurück ins Quiz
    → Mautic-Upsert + Segment → ZeroBounce über /api/validate-email
    → Postmark Mail 2 (Tag lead_access) + Mail 1 (Tag optin_coach)
    → Job in MySQL 'processed'

Weg 2 — Hot Lead (Mail 3), die Outbox:
  Rang 3 → enqueue_lead_sync('coach_hot_lead_email') (api/bridge.js:1970)
    → leads.lead_sync_outbox → n8n „AC - Lead Sync Outbox Worker“ (ALLHYLRwkvujkuFJ,
      jede Minute) triggert /api/lead-outbox-worker → Postmark (Tag hot_lead)

Weg 3 — Rang-Rückschreibung in die Kartei:
  Quiz → leads.lead_sync_outbox (Arten mysql_initial_rank, mysql_rank_update;
      api/lead-outbox-worker.js:50, callN8nUpdateResult :613)
    → POST https://n8n.hl-support.biz/webhook/update_result_by_hash
    → n8n „Update "Result" by hash“ (7Xg6NsE5H3UWgSNc, AKTIV)
    → UPDATE typeform_surveys SET points_rank/points_result WHERE hash = <lead_hash>
      (plus SELECT COUNT(*) als matchedRows-Gegenprobe)
```

Gemessene Mengen (31.08.2026, `lead_sync_outbox`): `mysql_rank_update` 1.352 erledigt,
`mysql_initial_rank` 909 erledigt, `coach_hot_lead_email` 250 — alle mit letztem Eintrag
von heute. Ein `mysql_initial_rank`-Auftrag hängt seit 19.05.2026 auf `pending` (der
bekannte geparkte Auftrag; die Health-Prüfung führt ihn getrennt als `outbox_parked`,
`api/lead-system-health.js:24/329`).

🔴 **Folgerung für M:** Die Outbox, in die Mail 1 und 2 einziehen, ist **keine leere
Mail-Warteschlange**, sondern fährt bereits Legacy-Schreibvorgänge (Weg 3). Und Weg 3
schreibt in **dieselbe Kartei-Zeile** (`typeform_surveys`), die Weg 1 anlegt und pollt.
Konsequenzen in §5 und §9.

**M schaltet ab:** Weg 1 ab dem Poller (der Workflow `9RZdrLxfA8IRhd55`).
**M lässt unangetastet:** Weg 2, Weg 3, den Outbox-Worker-Trigger `ALLHYLRwkvujkuFJ`, den
Health-Monitor `m52uJBbSQUFUA2Dm`, den Nurture-Sender `RqKSRTgFv8mv04H2`, den
Berater-Spiegel `IFOqAOYbUp8Zwnlk` (letzterer wird in M1 erweitert, nicht ersetzt).
🔴 Beim Abschalten in M6 wird **namentlich und per ID** geprüft, dass ausschliesslich
`9RZdrLxfA8IRhd55` deaktiviert wird — `7Xg6NsE5H3UWgSNc` wird **weiter gebraucht**.

---

## 2. 🔴 Inventur: ALLES, was der Post Processor tut

Erhoben am Workflow-Extrakt (`n8n/backups/9RZdrLxfA8IRhd55-vor-drift-fix-2026-08-30.json`,
36 Knoten — dieselbe Fassung, die läuft; die Drift-Korrektur vom 30.08. änderte nur die
Bibliothek in den Code-Knoten, Prüfsumme `883c5aa78cec941e`). Jede Zeile nennt die
Knoten als Beleg.

| # | Aufgabe | Knoten (Beleg) | Künftiges Zuhause | Wenn sie ersatzlos wegfiele |
| --- | --- | --- | --- | --- |
| I1 | **Kandidatensuche**: neue `typeform_surveys`-Zeilen (Form `hC2yTcU8`, seit `activation_time`) ohne Job finden | `Set Config`, `MySQL - Select New Candidate Surveys` | **entfällt** — der Auslöser ist künftig der Opt-in im Repo selbst (§4) | ohne Ersatz-Auslöser: keine Mail 1/2 mehr → M4 baut den Ersatz, **bevor** hier etwas abgeschaltet wird |
| I2 | **Jobverwaltung**: `INSERT IGNORE` in `lead_processing_jobs`, Claim (`pending/failed`, `attempts < max_attempts`, Backoff `POW(2,attempts)` min, max 60), `processed`/`failed`/`dead` | `MySQL - Insert Pending Jobs`, `- Claim Pending Jobs`, `- Load Claimed Jobs`, `- Mark Job Processed`, `- Mark Job Failed`, `Split In Batches` | **`leads.lead_sync_outbox`** — dieselbe Mechanik existiert dort schon (claim `FOR UPDATE SKIP LOCKED`, Backoff 2/5/15/60 min, `dead` nach 5 Versuchen; `supabase-lead-system-v2.sql:661/730`) | nichts — die Funktion wandert, sie fällt nicht weg |
| I3 | **Berater-Auflösung, dreistufig**: ① `contacts.coach_id` (≠ 1) ② sonst jüngster Kontakt mit gleicher E-Mail und `coach_id` ③ sonst `users.sub_domain` = `berater_slug` aus dem `form_response`-JSON; dann JOIN auf `users` + `organizations` (`o.org_name`) | SQL in `Select New Candidate Surveys` und `Re-Read Final Lead Context` (CASE-Kaskade) | **`leads.berater`** (Spiegel, 15-Min-Takt) über den Slug — wie beim Hot Lead (`server/berater-verzeichnis.js`) | 🔴 **Verhaltensunterschied**: heute kann der Berater aus der Kontakt-Historie kommen, künftig **nur** aus dem Slug. Wie oft die Kaskade etwas anderes liefert als der Slug, ist **nicht gemessen** → Messauftrag M1, Schattenvergleich M5 |
| I4 | **Lead-Modell bauen**: Profil/Ziel/Barriere aus `form_response` extrahieren, Namen normalisieren, Sprache bestimmen (6 Sprachen), Vorlagen füllen | `Code - Normalize Candidate Rows`, `Code - Build Lead Model` (Bibliothek, 1.708 Zeilen, 53 Funktionen) | **`server/mail-vorlagen/`** — Modell aus `leads.lead_state`, `lead_answers_current`, `leads.berater` (Feldabbildung M3) | keine Mails, keine Mautic-Daten — Kernstück des Ports |
| I5 | **Resume-Token + Kurzlink**: HTTP-POST an `business.activecenter.info/api/bridge`, `action generate_resume_token`; bei Fehler → Job `failed` (Wiederholung) | `HTTP - Generate Resume Token`, `Code - Apply Resume Link`, `If - Resume Token Failed` | **interner Modulaufruf** — die Logik liegt bereits lokal in diesem Repo (`api/bridge.js:4212 ff.`: JWT + `ensureResumeSessionRecord`; kein Legacy-System beteiligt). M4 zieht sie in ein Modul (`server/resume-token.js`), das Bridge-Aktion **und** Outbox-Worker teilen — eine Implementierung, nie zwei (Regel aus AGENTS.md) | Mail 2 verlöre ihren Kern (der Video-Zugangslink `video_access_url`), Mautic das Feld `ac_last_video_access_url` |
| I6 | **Mautic-Upsert**: Suche per E-Mail → `PATCH /contacts/{id}/edit` oder `POST /contacts/new`; Nutzdaten = 30 Felder (`ac_*`, Beraterfelder, `ac_last_video_access_url`; `bibliothek.js:1674-1705`) + Tags (`ac:funnel:…`, `ac:profile:…`, `ac:lang:…`; `:1665-1673`) | `HTTP - Mautic Search Contact`, `Code - Parse Search Result`, `HTTP - Mautic Update/Create Contact`, `Code - Choose Mautic Contact Id` | **eigene Outbox-Auftragsart `mautic_upsert`** im Worker (§4) | 🔴 **Nurture bricht**: die Strecke (Mail 4) sendet über Mautic; ohne Kontakt keine Nurture-Mail. Auch der DNC-Spiegel (`HmLGMm2H7Brxl8CK`) liefe ins Leere |
| I7 | **Mautic-Segment**: `POST /segments/{id}/contact/{id}/add`, Segment je Sprache (de 2, it 3, en 4, fr 5, ru 6 — `Set Config`; 🔴 **hu fehlt**, fällt auf de zurück, `treiber-3-apply-resume-link.js:37`) | `HTTP - Mautic Add To Segment`, `Code - Check Segment Result` | Teil der Auftragsart `mautic_upsert` | Neue Leads landen in keinem Segment → Nurture-Eintritt bricht |
| I8 | **Adressprüfung**: POST an das eigene `/api/validate-email` (ZeroBounce bzw. zentraler Reputationsdienst); Entscheidung: `valid`/`unknown`/`role_based`/`catch-all`/`accept_all`/`api_error` → Mail 2 senden, sonst **Mail 2 überspringen, Mail 1 trotzdem senden** | `HTTP - ZeroBounce Validate Lead Email`, `If - Lead Email Allowed`, `Code - Skip Lead Email` | **direkter Modulaufruf** im Worker (dieselbe Logik wie `api/validate-email.js`, ohne HTTP-Selbstaufruf); die Erlaubnis-Entscheidung wird zeichengleich übernommen | ohne Prüfung stiege der Bounce des Servers `Leadgen` (heute 0,87 %) — Reputationsrisiko für **alle** Mails des Kontos |
| I9 | **Mail 2 senden** (Lead-Zugangsmail): From `"<coach_full_name> - <organisation_name>" <mail@mail.hl-support.biz>`, Tag `lead_access`, Metadata `job_id`/`typeform_survey_id`/`contact_id`/`mautic_contact_id`, Stream `outbound` | `HTTP - Postmark Send Lead Email` | **Outbox-Auftragsart `lead_access_email`** (§4) | der Lead bekommt keinen Zugang zu den Videos — der teuerste stille Ausfall |
| I10 | **Mail 1 senden** (Berater-Benachrichtigung): From `"<organisation_name>-Support" <mail@…>`, Betreff fest **deutsch** („Neuer Erfolgs-Code von: …", `bibliothek.js:1662`), Tag `optin_coach` | `HTTP - Postmark Send Coach Email` | **Outbox-Auftragsart `coach_optin_email`** (§4) | der Berater erfährt nichts vom Lead — Werbegeld verpufft |
| I11 | **Statusrückschreibung nach MySQL**: `processed` + `coach_email_sent_at`, `coach_email_message_id`, `contact_email_queued_at`, `contact_email_reference`, `mautic_synced_at`, `mautic_contact_id`, `mautic_segment_alias`; bzw. `failed`/`dead` + `last_error` | `Code - Build Final Outcome`, `If - Processing Succeeded`, `MySQL - Mark Job Processed`, `- Mark Job Failed` | **`response_data` der Outbox** (schreibt der Worker heute schon je Job) + neue `lead_events` (§4). 🔴 **Nach MySQL wird nichts mehr zurückgeschrieben** | 🟡 offen, ob irgendjemand diese MySQL-Spalten liest (CRM-Oberfläche von contacts?). Nicht belegt → §12. Bis zur Klärung gilt: die Spalten bleiben ab M6 einfach leer, die Tabelle wird nicht angefasst |
| I12 | **Wiederholung mit Backoff** bei jedem Teilfehler (Resume, Mautic, Segment, Postmark) | `If`-Kaskade + `Mark Job Failed` | Outbox-Retry (2/5/15/60 min, `dead` nach 5) | nichts — wandert |

**Was der Post Processor ausdrücklich NICHT tut** (und was M bewusst ändert):

- Er hinterlässt **kein Ereignis in unserer Datenbank** — ob Mail 1/2 rausging, beweist
  heute nur Postmark (Falle 4 in `MAILWEGE.md` §5). M4 schreibt künftig je Versand ein
  `lead_events`-Ereignis mit eindeutiger `event_uid` — das ist zugleich die zweite
  Verteidigungslinie gegen Doppelversand.
- Er kennt **keinen Teilschritt-Merker**: scheitert Mail 1, nachdem Mail 2 schon gesendet
  wurde, setzt `Mark Job Failed` den ganzen Job auf `failed`, und der nächste Lauf
  wiederholt **alles** — Mail 2 ginge dann doppelt raus. Das ist im heutigen Bauwerk
  angelegt (die Sende-IDs werden erst bei `processed` gespeichert, einen Merker je Mail
  gibt es nicht). Die Trennung in **zwei Auftragsarten mit je eigenem Sent-Ereignis**
  (§4) behebt genau diese Klasse.

**Sicherheitsbefund am Rande** (gehört nicht zu M, aber gefunden ist gefunden): Die vier
Mautic-Knoten tragen die Zugangsdaten **hart kodiert** als `Authorization: Basic …` im
Workflow — und damit im Klartext in den Repo-Sicherungen unter `n8n/backups/` und
`n8n/export-2026-08-28/`. Beim Port wandert der Zugang in ein Env-Secret; danach gehört
das Mautic-Passwort **rotiert**. Als eigener Punkt in M8.

---

## 3. Die Vorlagen: zeichengleich beweisen, nicht behaupten

**Ausgangslage (gemessen, BEFUND.md):** EINE Bibliothek, 1.708 Zeilen, 53 Funktionen,
Prüfsumme `883c5aa78cec941e` — identisch in allen drei Code-Knoten des laufenden Workflows
und im Repo-Extrakt `docs/audits/c1-postprocessor-extrakt/bibliothek.js`. Von den 53
Funktionen sind 12 mailbezogen (Aufzählung: benachrichtigungsweg-Plan §4a/2a); der Rest
baut das Modell.

**Sprachlage, am Extrakt belegt — wichtiger als gedacht:**

| Mail | Sprachen | Beleg |
| --- | --- | --- |
| Mail 1 (Berater) | **einsprachig deutsch** — Betreff und Rumpf | `bibliothek.js:1662` (Betreff), `:1486-1525` (`buildCoachEmailHtml/Text`) |
| Mail 2 (Lead) | **sechs** Fassungen: de/it/en/fr/ru/hu | `bibliothek.js:48` (`normalizeLanguage`), `:652-1114` (`LEAD_EMAIL_COPY`) |

Der Auftrag nennt vier Sprachen (de/it/en/hu) — das sind die mit echtem Verkehr. Der
Vergleich muss trotzdem **alle sechs** Fassungen abdecken, sonst wäre die erste
fr/ru-Einsendung nach dem Umschalten ein ungeprüfter Pfad.

**Der From-Header gehört zum Vergleich** — und er kommt heute NICHT aus der Bibliothek,
sondern aus den Postmark-Knoten des Workflows:

| | heute (Knoten-Ausdruck) | Falle |
| --- | --- | --- |
| Mail 1 | `(coach_organisation_name \|\| 'Activecenter') + '-Support' <mail@mail.hl-support.biz>` | |
| Mail 2 | `(coach_full_name \|\| 'Coach') + ' - ' + (coach_organisation_name \|\| 'Activecenter') <mail@mail.hl-support.biz>` | 🔴 wer im Repo einfach `POSTMARK_FROM` nähme (Default `Activecenter-Support <…>`), änderte den Absendernamen **jeder** Mail 2 |

### Der Vergleich, konkret — drei Beweisebenen

**Ebene 1 — Bibliothek gegen Port (statisch, im Test):** Der Extrakt ist pures JS ohne
n8n-Globals (`$input`/`$()` kommen nur in den Treibern vor — BEFUND §5). Der Golden-Test
lädt deshalb die **Original-Bibliothek direkt** (`require`/`vm` auf
`docs/audits/c1-postprocessor-extrakt/bibliothek.js`, davor Prüfsummen-Assert
`883c5aa78cec941e` — schlägt der an, wurde am Extrakt geschraubt) und füttert Original und
Port mit **denselben** Modellen: je Sprache × je Variante (mit/ohne Barriere, ohne
Telefon, ohne Organisation, `default`-Fälle). Erwartung: Betreff, HTML und Text **byteweise
gleich** — `assert.strictEqual`, kein „ähnlich".

**Ebene 2 — Port gegen echte versendete Mails:** Seit 28.08. tragen die Mails Tags
(`optin_coach`, `lead_access`). Je Sprache mit echtem Fall wird eine real versendete Mail
aus Postmark gezogen (`/messages/outbound?...&tag=…`, dann `/messages/outbound/{id}/details`;
`count` **und** `offset` Pflicht, Zeitstempel EDT = MESZ − 6 h — Fallen aus MAILWEGE §5),
der zugehörige Lead über die Metadata (`typeform_survey_id`, `contact_id`) und
`leads.lead_state` aufgelöst, und die Mail im Repo neu erzeugt. Zeichenvergleich über
Betreff, HtmlBody, TextBody **und** From/Tag/Stream. Zwei Stellen dürfen abweichen und
werden vor dem Vergleich **normalisiert und einzeln ausgewiesen**: der Resume-Link (JWT
zeitabhängig, Kurzschlüssel zufällig) und formatierte Zeitstempel. Alles andere: 0 Diff.
Sprachen ohne echten Fall (erwartet: fr, ru, evtl. hu) werden benannt und bleiben auf
Ebene 1 + 3 gestützt — nicht stillschweigend übersprungen.

**Ebene 3 — Schattenlauf am echten Verkehr (M5):** Für jeden echten Opt-in erzeugt der
neue Weg die Mails, sendet **nicht**, und vergleicht gegen das, was der Poller wirklich
über Postmark versendet hat (per API nachgeladen). Ergebnis wird **haltbar** geschrieben
(eigene Tabelle `leads.optin_mail_schatten`: lead_hash, art, erzeugt_am,
postmark_message_id, diff-Befund) — ausdrücklich **nicht** nur `console.warn`: die Lehre
aus B2a des Benachrichtigungsplans, wo der Vergleich im flüchtigen Containerprotokoll
lebte und jeden Deploy nicht überlebt hätte.

---

## 4. Zielbild: die Auftragsarten, der Auslöser, die Dedupe-Kette

### 4a. Neue Auftragsarten neben den bestehenden

`SUPPORTED_SYNC_TYPES` (`api/lead-outbox-worker.js:51`) wächst von drei auf sechs:

| Auftragsart | seit | tut |
| --- | --- | --- |
| `mysql_initial_rank`, `mysql_rank_update` | bestehend | Rang in die Kartei (Weg 3) — **unverändert** |
| `coach_hot_lead_email` | bestehend | Mail 3 — **unverändert** |
| `lead_access_email` | **neu** | Resume-Token bauen → Adressprüfung → Mail 2 senden → Sent-Ereignis |
| `coach_optin_email` | **neu** | Berater auflösen → Mail 1 senden → Sent-Ereignis |
| `mautic_upsert` | **neu** | Mautic-Kontakt suchen/anlegen/aktualisieren + Segment je Sprache |

**Bewusst drei getrennte Aufträge statt eines Sammelauftrags** (der Poller macht heute
alles in einem Job — daraus folgt die Doppelversand-Falle bei Teilfehlern, §2). Getrennt
heisst: scheitert Mautic, wiederholen nur die Mautic-Schritte; eine schon gesendete Mail
wird nie erneut angefasst. Der Preis: die heutige **Reihenfolge-Garantie** (Mautic vor
Mail 2, Mail 2 vor Mail 1) entfällt — die drei Aufträge laufen unabhängig. Geprüft, ob das
trägt: Mail 1 und 2 referenzieren einander nicht; die Mautic-`Metadata` in den Mails
(`mautic_contact_id`) ist das einzige Band — sie wird im neuen Weg durch `lead_hash` in
der Metadata ersetzt (ohnehin nötig fürs Nachzählen, §7). Die Nurture-Strecke taktet alle
2 Stunden — ob der Mautic-Kontakt Sekunden vor oder nach Mail 2 entsteht, ist für sie
belanglos.

### 4b. Was es heisst, in eine Warteschlange mit Legacy-Verkehr einzuziehen

Die Mail-Aufträge teilen sich `leads.lead_sync_outbox` mit den `mysql_*`-Aufträgen
(Weg 3). Am Bauwerk geprüft (`supabase-lead-system-v2.sql`):

- **Reihenfolge:** `claim_outbox_jobs` claimt nach `created_at` aufsteigend, Batch
  Standard 10 (max 25), `FOR UPDATE SKIP LOCKED` (`:686-694`). Es gibt **keine
  Priorisierung nach Art** — ein Schwall `mysql_rank_update` (Video-Nachmittage) schiebt
  sich vor eine Opt-in-Mail. Bei heutigem Aufkommen (~2.500 Aufträge in Monaten, Worker
  im Minutentakt) ist die erwartbare Zusatzverzögerung Sekunden bis wenige Minuten —
  **gemessen wird sie im Schattenlauf** (M5 protokolliert enqueue→claim-Abstand). Erst
  wenn die Messung > 2 Minuten zeigt, wird priorisiert (Mail-Arten zuerst) — nicht
  vorsorglich, das wäre eine zweite Änderung ohne Not.
- **Sperren:** `locked_by`/`locked_at` je Job; verwaiste Sperren werden nach 10 Minuten
  als `stale_lock_timeout` auf `failed` zurückgesetzt (`:667-676`). Für Mails bedeutet ein
  stale-Reset eine **Wiederholung** — deshalb muss der Sende-Schritt selbst idempotent
  sein (Sent-Ereignis **vor** Postmark prüfen, siehe 4d), nicht nur der Auftrag.
- **Wiederholungen:** `attempts`/`max_attempts` (5), Backoff 2/5/15/60 min
  (`mark_outbox_failed`, `:746-752`). Ein Postmark-Ausfall verzögert also, verliert aber
  nicht — bis `dead`.
- **Totläufer:** `dead` + `dead_at`; sichtbar über `leads.v_sync_dead_jobs` (`:317`) und
  als Health-Issue `outbox_dead_jobs` (`api/lead-system-health.js:412`). Ein toter
  Mail-Auftrag ist ein **stiller Ausfall** — er wird durch die Zählprüfung (§7)
  zusätzlich gefangen, nicht nur durch die Dead-Anzeige.
- **Der geparkte Auftrag** vom 19.05. bleibt, was er ist — M nutzt ihn als Gegenprobe,
  dass `outbox_parked` Mail-Arten genauso ausweisen würde.

### 4c. Der Auslöser — wo der Auftrag entsteht

Heutiger Opt-in-Fluss im Repo: `forward_typeform_adapter` (`api/bridge.js:4057`) →
Weiterleitung an die Kartei → bei 2xx `persistBusinessSubmissionToLeadStateV2`
(`api/bridge.js:4121`) schreibt den Lead in `leads.lead_state`.

**Der Auftrag entsteht unmittelbar nach erfolgreichem `persistBusinessSubmissionToLeadStateV2`** —
an derselben Stelle, an der heute schon Meta CAPI angestossen wird. Drei Aufträge
(`lead_access_email`, `coach_optin_email`, `mautic_upsert`) in einem Zug, über die
vorhandene `enqueueLeadSync`-Hilfe (`api/bridge.js:1874`).

Bewusste Konsequenz, ausgewiesen statt versteckt: Damit hängt die Auftragserzeugung
(wie heute die ganze Persistenz) am **2xx der Kartei-Weiterleitung**. Das ist während des
Parallelbetriebs richtig — der Poller sieht exakt dieselben Fälle, der Schattenvergleich
vergleicht Gleiches mit Gleichem. Nach dem Umbau durch Strang B (Weiterleitung hinter der
Outbox, B3) wandert der Anker auf die Persistenz selbst; das ist dann eine bewusste
Verbesserung (Mail auch bei lahmender Kartei), die **erst nach M7** angefasst wird — nie
zwei Änderungen gleichzeitig am Versandweg.

### 4d. Die Dedupe-Kette gegen Doppelversand — drei Verteidigungslinien

1. **Beim Entstehen:** `enqueue_lead_sync` dedupliziert heute **nur**
   `coach_hot_lead_email` (Advisory-Lock + Existenzprüfung je `lead_hash`;
   `supabase-lead-system-v2.sql:524-537`). Die RPC wird auf die drei neuen Arten
   erweitert: je `(lead_hash, sync_type)` höchstens ein Auftrag, gleiche Mechanik.
   → Doppelklick, Browser-Retry, doppelter Adapter-Aufruf: **ein** Auftrag.
   🟡 Bewusster Unterschied zu heute: der Poller dedupliziert je `typeform_survey_id`
   (je Kartei-Zeile). Reicht ein Lead das Formular **zweimal mit verschiedenen Tokens**
   ein, verschickt der alte Weg zwei Mailpaare, der neue eines. Der Schattenlauf zählt,
   wie oft das vorkommt (Erwartung: selten bis nie); der Fall wird als gewollte
   Verhaltensänderung dokumentiert, nicht als Diff-Fehler gewertet.
2. **Beim Senden:** vor jedem Postmark-Aufruf Prüfung auf das Sent-Ereignis, nach jedem
   Versand Schreiben desselben mit eindeutiger `event_uid`
   (`optin_coach_email_<lead_hash>` / `lead_access_email_<lead_hash>`,
   `ON CONFLICT ignore`) — exakt das Muster, das beim Hot Lead seit Monaten trägt
   (`hotLeadAlreadySent` `api/lead-outbox-worker.js:761`, `insertHotLeadSentEvent` `:877`).
   → stale-Lock-Wiederholung, Doppel-Claim, Handstart: **kein** zweiter Versand.
   Nebeneffekt: Falle 4 aus MAILWEGE (Opt-in-Mail hinterlässt kein DB-Ereignis) ist
   damit geschlossen.
3. **Nach dem Senden:** die Zählprüfung gegen Postmark (§7) entdeckt, was die ersten
   beiden Linien durchgelassen hätten — auch die Sorte „beide Quellen haben gesendet",
   die keine repo-interne Prüfung sehen kann.

### 4e. Der Schalter

Eine Variable, drei Zustände, nach dem bewährten Muster von `COACH_LOOKUP_SOURCE`
(dort: `bridge`/`beide`/`verzeichnis` — B-Reihe):

| `OPTIN_MAIL_MODUS` | Aufträge entstehen | Worker | Wer sendet |
| --- | --- | --- | --- |
| ungesetzt / `aus` (Standard) | nein | Arten unbekannt → würde ablehnen; kommt nicht vor, da nichts entsteht | nur der Poller (heute) |
| `schatten` | ja | baut Mail + Mautic-Nutzdaten, **sendet nicht**, schreibt Vergleich, markiert `done` mit `reason: schattenlauf` | nur der Poller |
| `scharf` | ja | sendet über Postmark, schreibt Sent-Ereignis | nur die Outbox (Poller ist ab M6 aus) |

Der Standard ist bewusst `aus`: ein Deploy ohne gesetzte Variable ändert **nichts** —
dieselbe Nullwirkungs-Regel wie bei B1 (dort per Gegenprobe bewiesen).

---

## 5. 🔴 Parallelbetrieb: zu jedem Zeitpunkt sendet genau EINE Quelle

Die Doppelversand-Matrix über alle Phasen — sie ist das Rückgrat des Plans:

| Phase | Poller sendet | Outbox sendet | Doppelrisiko | Absicherung |
| --- | --- | --- | --- | --- |
| heute … M4 | ja | nein (Arten existieren nicht / Modus `aus`) | keins | — |
| M5 Schattenlauf | ja | **nein** (Modus `schatten`, Versand baulich abgeklemmt) | keins — der Schattenzweig hat **keinen** Postmark-Aufruf im Codepfad, nicht bloss ein `if` vor dem Senden | Test beweist: im Modus `schatten` existiert kein Weg zum Postmark-Client |
| M6 Umschaltminute | wird deaktiviert | wird scharf | 🔴 **das einzige echte Fenster** | Reihenfolge in M6: **erst Poller aus, dann scharf** — dazwischen entsteht eine Lücke (kein Doppel!), die das Runbook explizit schliesst (unten) |
| nach M6 | nein (Workflow inaktiv) | ja | nur bei versehentlicher Reaktivierung | Frühwarnung: Postmark-Zählung würde 2 statt 1 je Opt-in zeigen; zusätzlich prüft die Nachlauf-Beobachtung (M7) täglich, dass `9RZdrLxfA8IRhd55` inaktiv ist |

**Warum „erst aus, dann scharf" und nicht umgekehrt:** Stünde die Outbox zuerst scharf,
sendeten für jeden Opt-in im Überlappungsfenster (bis zu 5 Minuten Poller-Takt) **beide**
Quellen — Doppelversand, die teuerste Fehlerwirkung. Die umgekehrte Reihenfolge erzeugt
statt dessen eine **Lücke** von wenigen Minuten, in der niemand sendet. Eine Lücke ist
reparierbar (nachsenden), ein Doppelversand nicht (niemand kann eine Mail zurückholen).
Deshalb: Lücke bewusst in Kauf nehmen, klein halten (nachts umschalten — die gemessenen
Opt-in-Pausen ≥ 3 h sind häufig, MAILWEGE §2), und im Runbook beweisbar schliessen (M6
Schritt 7).

**Und im Schatten entstandene `done`-Aufträge senden nie nach:** Ein Auftrag, den der
Worker im Modus `schatten` als `done`/`reason: schattenlauf` abgelegt hat, wird nach dem
Umschalten **nicht** wieder angefasst (Status `done` wird nie erneut geclaimt —
`claim_outbox_jobs` nimmt nur `pending`/`failed`). Die Opt-ins der Umschalt-Lücke brauchen
deshalb **neue** Aufträge — das erledigt das Runbook, nicht ein Automatismus, und die
Sent-Ereignis-Prüfung plus Postmark-Abgleich davor machen das Nachsenden gefahrlos.

---

## 6. Die Schritte

Jeder Schritt: Vorbedingung → Artefakte → Beweis → Rückweg → Frühwarnung.
🔴 **Je Schritt genau EINE Änderung am System; nie zwei am Versandweg.** Zwischen zwei
Schritten mit Produktionswirkung liegt mindestens ein voller Werktag Beobachtung.

### M1 — Datenlücken schliessen und Zuordnung messen (noch kein Repo-Code am Versandweg)

**Vorbedingung:** keine — M1 ist lesend plus eine Spiegel-Erweiterung abseits des
Versandwegs.

**Artefakte:**
1. 🔴 **`leads.berater` um das Berater-Telefon erweitern.** Mail 2 enthält den
   WhatsApp-Link des Beraters (`coach_whatsapp_url` aus `coach_phone_formatted` —
   Modellfelder von `buildPremiumLeadEmailHtml/Text`, am Extrakt erhoben), und die
   Mautic-Nutzdaten führen `ac_berater_whatsapp`. Der Spiegel
   (`IFOqAOYbUp8Zwnlk`) liest heute **kein** Telefon (SQL am Backup
   `n8n/backups/berater-verzeichnis-spiegeln-2026-08-31-vor-org-name.json` geprüft:
   `email, first_name, last_name, full_name, country, preferred_language,
   organisation_name, herbalife_id` — sonst nichts). Erweiterung: Spalten
   `area_code`, `phone_number` in Quelle-SQL, `jsonb_to_recordset`-Schema und
   Upsert; zugehörige Spalten in `leads.berater`.
   Verfahren zwingend nach `agent-core/skills/n8n-workflow-update`: Definition sichern
   (`n8n/backups/`), **API-PUT, nie SQL**, `versionId` muss sich ändern, Workflow bleibt
   aktiv. 🔴 Nicht am selben Tag wie eine Umschaltung der B-Reihe (`COACH_LOOKUP_SOURCE`) —
   derselbe Spiegel, nie zwei Änderungen gleichzeitig.
2. **Zuordnungsdifferenz messen (nur lesen):** Für die letzten ~350 Opt-ins die
   dreistufige Kaskade des Pollers (I3) gegen die reine Slug-Auflösung stellen: bei wie
   vielen liefert `contacts.coach_id`/E-Mail-Stufe einen **anderen** Berater als der
   Slug? Abfrage direkt auf MySQL (lesend, wie bei der B-Reihe am 30.08.).
3. **Doppel-Submit-Häufigkeit messen:** wie viele `lead_hash` haben mehr als eine
   `typeform_surveys`-Zeile (für die Dedupe-Entscheidung 4d/1)?

**Beweis:** Spiegel schreibt nach der Erweiterung weiterhin 255±-Zeilen, **zwei Läufe**
hintereinander stabil (eine Messung ist kein Beweis), Telefonfelder für eine Stichprobe
von 12 Beratern zeichengleich mit der MySQL-Quelle. Messergebnisse 2 und 3 stehen als
Zahlen in diesem Dokument (Nachtrag).

**Rückweg:** Spiegel-Definition aus der Sicherung zurückspielen (API-PUT).

**Frühwarnung:** Der Spiegel bricht laut ab bei < 50 Zeilen oder doppelten Slugs
(eingebaut, `Code - Zeilen pruefen`); zusätzlich nach der Änderung zwei Takte (30 min)
die Ausführungsliste beobachten.

### 🔴 Entscheidung Markus, 31.08.2026 — die Kaskade ist damit erledigt

Die offene Frage „Kaskade nachbauen oder auf Slug vereinfachen" ist **beantwortet**, und
zwar anders, als sie hier gestellt war. Sie zerfällt in zwei Dinge, die nicht am selben Ort
gehören:

**1. Die Seitenauflösung geht über den Slug — ausschliesslich.** Wer auf die Seite kommt,
übergibt nur den Slug; daraus werden über `users.sub_domain` die Beraterdaten gelesen, und
damit hat die Seite ihren Berater. Hier gibt es **keine** Kaskade und soll keine geben.
Strang A ist damit richtig gebaut.

**2. Die Zuordnung des Kontakts passiert beim SENDEN, nicht beim Anzeigen.** Dort läuft die
Doppelvergabe-Kontrolle — beraterübergreifende Suche über die E-Mail, drei Fälle,
4-Monats-Bestellfrist, Abo-Umleitung an die Upline. **Dabei kann sich der Berater ändern,
und das ist gewollt.** Diese Prüfungen bleiben vollständig erhalten; sie ziehen nur von
n8n nach `QuizIntake` in contacts um — dieselbe Logik, die Umfragen unter
`SurveyIntake::zuordnen()` bereits fährt. Einzelheiten und Belege:
[umsetzung-b-lead-uebergabe.md §4a](umsetzung-b-lead-uebergabe.md).

**Damit ändert sich I3 in der Inventur oben:** Der Berater kommt künftig **nicht** aus einer
SQL-Kaskade über die Kontakt-Historie, sondern
- für die **Anzeige** aus dem Slug (Strang A), und
- für den **Versand** aus dem Feld `coach_member_id`, das die Antwort von `/webhook/quiz`
  zurückmeldet.

🔴 **Für M4 heisst das konkret:** Der Outbox-Auftrag für **Mail 1** darf **nicht** an den
Berater des Slugs adressiert werden, sondern an den **zurückgemeldeten**. Sonst
benachrichtigen wir bei jeder Umleitung den Falschen — und Umleitungen sind kein
Randfall, sondern der Zweck der Kontrolle. Der Auftrag entsteht deshalb **erst nach**
erfolgreicher Übergabe und trägt den Empfänger aus der Antwort.

Die Messung „wie oft weicht die Kaskade vom Slug ab" (Messung 2) bleibt trotzdem
sinnvoll — **nicht mehr als Entscheidungsgrundlage**, sondern als Erwartungswert: Sie sagt
voraus, wie oft `case = fremder_kontakt_bleibt` künftig auftreten wird. Weicht die
Wirklichkeit später stark davon ab, ist etwas falsch verdrahtet.

### M2 — Vorlagen-Port mit Golden-Tests (kein Laufzeit-Effekt)

**Vorbedingung:** M1-Messungen liegen vor (die Modelle für die Tests brauchen die
Telefon-Wahrheit).

**Artefakte:** `server/mail-vorlagen/` (CommonJS, kein n8n-Global): die 12 mailbezogenen
Funktionen plus die Modellbau-Helfer, die sie brauchen; dazu die From-Header-Bildung aus
den Postmark-Knoten (§3) — als Code, nicht als Env-Default. Golden-Tests Ebene 1 und 2
(§3). Der Extrakt unter `docs/audits/c1-postprocessor-extrakt/` bleibt unangetastet
Referenz (Prüfsummen-Assert im Test).

**Beweis:** Ebene 1 grün für 6 Sprachen × Varianten; Ebene 2 grün für jede Sprache mit
echtem Fall (erwartet mindestens de/it/en; hu prüfen — die Nurture-Strecke kennt kein hu,
aber Mail 2 sehr wohl; fr/ru als „kein echter Fall" ausgewiesen, falls so). Gesamtlauf
aller Tests grün (Stand 31.08.: 262).

**Rückweg:** entfällt — totes Modul plus Tests, kein Aufrufer in Produktion. Deploy hat
Nullwirkung (Gegenprobe wie bei B1: ein unbeteiligter Endpunkt antwortet unverändert).

**Frühwarnung:** entfällt (kein Laufzeitpfad).

### M3 — Feldabbildung: das Modell aus der Plattform-DB (nur Nachweis, kein Umbau)

**Vorbedingung:** M2 (die Tests definieren, welche Felder gebraucht werden).

**Artefakte:** Feld-für-Feld-Nachweis als Tabelle (Dokument im Audit-Ordner): jedes Feld,
das `buildLeadModel` heute aus `MySQL - Re-Read Final Lead Context` zieht, gegen seine
Plattform-Quelle (`leads.lead_state`, `lead_answers_current`, `leads.berater`,
`lead_events`) — einschliesslich der Antwort-Extraktion (Barriere aus `lead_q6_barrier`)
und der Sprachbestimmungskette. Für 10 echte, kürzlich verarbeitete Leads beide Modelle
nebeneinander gebaut (lesend!) und verglichen.

**Beweis:** 10 von 10 Modellvergleiche deckungsgleich in allen Feldern, die in Mail oder
Mautic-Nutzdaten einfliessen — oder jede Abweichung benannt mit Entscheidung (z. B. Felder,
die **nur** in MySQL existieren; Kandidat: `contact_id`/`typeform_survey_id` selbst — die
gibt es auf der Plattform nicht; sie verschwinden aus der Metadata zugunsten `lead_hash`).

**Rückweg/Frühwarnung:** entfällt (lesend).

### M4 — Auftragsarten, Erzeuger, Dedupe, Schalter — ausgeliefert mit Nullwirkung

**Vorbedingung:** M2 + M3 grün. 🔴 **Und: Strang B läuft ruhig** (siehe §10 — Markus'
Vorgabe; konkret messbar: B3 des bridge-Plans erbracht, d. h. ein echtes Opt-in landet
einmal in Contacts, Wiederholung `duplicate: true`, seit ≥ 7 Tagen ohne Befund; solange B
nicht so weit ist, wartet M4).

**Artefakte:**
1. SQL-Migration: `enqueue_lead_sync` um die Dedupe der drei neuen Arten erweitert (4d/1).
2. `server/resume-token.js` — Extrakt der `generate_resume_token`-Logik aus
   `api/bridge.js:4212 ff.`; die Bridge-Aktion delegiert dorthin (eine Implementierung).
3. Worker-Zweige für `lead_access_email`, `coach_optin_email`, `mautic_upsert` in
   `api/lead-outbox-worker.js`, nach dem Muster `sendHotLeadCoachEmail` (Guard →
   already-sent → Modell → senden → Ereignis); Mautic-Zugang aus neuen Env-Variablen.
4. Erzeuger im Adapter (4c), hinter `OPTIN_MAIL_MODUS` (Standard `aus` → es entsteht
   **kein** Auftrag).
5. Schattenschreiber + Tabelle `leads.optin_mail_schatten` (§3 Ebene 3).
6. Health-Erweiterung in `api/lead-system-health.js`: neues Issue
   `optin_ohne_auftrag` — `form_submitted`-Leads der letzten 24 h ohne zugehörige
   Auftrags-Trias, älter als 30 min (greift ab Modus `schatten`; nach `scharf` zusätzlich
   `optin_ohne_versandereignis`). Das ist die eingebaute Daueranswer auf den stillen
   Ausfall — der 15-Minuten-Monitor ruft sie ohnehin auf.
7. Tests für alles — insbesondere: im Modus `schatten` existiert **kein** Codepfad zum
   Postmark-Aufruf (§5); im Modus `aus` entsteht kein Auftrag; Doppel-enqueue liefert
   dieselbe Job-ID.

**Beweis:** Alle Tests grün; Deploy über CI (`/health/live` trägt den Commit); danach
Gegenprobe der Nullwirkung: `lead_sync_outbox` enthält **null** Aufträge der neuen Arten,
Poller-Ausführungen unverändert `success` im 5-Minuten-Takt, Postmark-Tageszählung
unverändert.

**Rückweg:** Deploy zurück (Revert-PR). Kein Datenrückbau nötig — es ist nichts entstanden.

**Frühwarnung:** Health-Monitor (läuft alle 15 min gegen `/api/lead-system-health`);
CI-Deploy-Beweis.

### M5 — Schattenlauf: erzeugen, vergleichen, nicht senden

**Vorbedingung:** M4 seit ≥ 1 Werktag ohne Befund in Produktion.

**Handlung:** `OPTIN_MAIL_MODUS=schatten` über die Coolify-Env (kein Deploy — derselbe
Weg wie `COACH_LOOKUP_SOURCE` in B2).

**Beweis, bevor es weitergeht — alle vier, über mindestens 7 Tage und ≥ 25 Opt-ins:**
1. **Vollzähligkeit:** je Opt-in genau eine Auftrags-Trias, kein Fehl, kein Doppel —
   Abgleich `form_submitted`-Ereignisse ↔ Aufträge (das neue Health-Issue muss dauerhaft
   0 melden).
2. **Zeichengleichheit:** je gesendeter Poller-Mail (Postmark-Abruf) 0 Diff zur
   Schattenmail nach Normalisierung (§3 Ebene 3) — Betreff, HTML, Text, From, Tag. Diffs
   werden erklärt oder behoben; unerklärte Diffs sperren M6.
3. **Mautic-Gleichheit (lesend):** je Opt-in die Schatten-Nutzdaten gegen den vom Poller
   geschriebenen Mautic-Kontakt (GET) — Feldgleichheit inkl. Segment je Sprache.
4. **Latenz:** enqueue→claim-Abstand der Schattenaufträge (4b) — Median und Maximum
   dokumentiert.

Zusätzlich gezählt: Doppel-Submits (4d/1) und Slug-vs-Kaskade-Fälle (M1/2) im Fenster.

**Rückweg:** Modus zurück auf `aus` — reine Env-Änderung, Poller war nie beeinflusst.

**Frühwarnung:** Schatten-Tabelle ist per SQL abfragbar (überlebt Deploys); Health-Issue;
Poller-Ausführungen weiter beobachtet.

🔴 **Zwischen M5 und M6 keine anderen Eingriffe am Versandweg** (auch nicht Postmark-Server-
Umzüge der 47 Fremdmails oder Nurture-Stream-Wechsel — MAILWEGE §6 Schritt 2/5 warten).

### M6 — Der Umschaltpunkt: ein Runbook, eine Nacht, eine Quelle

**Vorbedingung:** M5-Beweise vollständig; Markus hat den Umschaltzeitpunkt freigegeben;
Zeitfenster nachts (Opt-in-arm, MAILWEGE §2); **kein** weiterer Deploy an diesem Tag.

**Runbook — in dieser Reihenfolge, jede Zeile mit Beleg protokolliert:**

| # | Handlung | Beleg |
| --- | --- | --- |
| 1 | Workflow-Definition `9RZdrLxfA8IRhd55` sichern → `n8n/backups/9RZdrLxfA8IRhd55-vor-m6-stilllegung-<datum>.json` (Verfahren `agent-core/skills/n8n-workflow-update`) | Datei committet, Prüfsumme notiert |
| 2 | Warten auf einen **leeren** Poller-Lauf: `typeform_surveys` hat keine unverarbeiteten Kandidaten (Kandidaten-SQL aus I1 lesend ausführen), `lead_processing_jobs` keine `pending`/`processing`/`failed` mit Restversuchen | SQL-Ausgaben; letzter Lauf `success` mit Leerlauf-Dauer (2–3 s, MAILWEGE §7) |
| 3 | Zeitpunkt **T0** notieren. Poller deaktivieren — per n8n-API (`active: false`), **nur** `9RZdrLxfA8IRhd55`; 🔴 Gegenprüfung, dass `7Xg6NsE5H3UWgSNc` (Weg 3), `ALLHYLRwkvujkuFJ`, `IFOqAOYbUp8Zwnlk`, `RqKSRTgFv8mv04H2`, `m52uJBbSQUFUA2Dm`, `HmLGMm2H7Brxl8CK` **aktiv geblieben** sind | Workflow-Liste per API vorher/nachher; `versionId`-Verhalten dokumentiert |
| 4 | `OPTIN_MAIL_MODUS=scharf` setzen (Coolify-Env); Zeitpunkt **T1** notieren | Env per Coolify-API gegengelesen (`is_literal`), `/health/ready` grün |
| 5 | Lückenfenster [T0, T1] schliessen: alle Leads mit `form_submitted_at` in [T0 − 10 min, T1] auflisten; je Lead **erst** gegen Postmark prüfen (Tags `optin_coach`/`lead_access`, MESZ = EDT + 6 h), ob der Poller schon gesendet hat, **und** gegen `lead_events`, ob die Outbox gesendet hat; nur wer nachweislich **von keiner Quelle** bedient wurde, bekommt neue Aufträge (`enqueue_lead_sync` von Hand). Erwartung nachts: 0 Fälle | Tabelle im Protokoll: Lead, Postmark-Befund, Ereignis-Befund, Handlung |
| 6 | Den nächsten **echten** Opt-in abwarten: Mail 1 und Mail 2 kommen aus der Outbox — Tag, From, Inhalt, Abstand Opt-in→Mail jetzt **Sekunden** statt 2–5 Minuten | Postmark-Nachweis + `lead_events` + Outbox-`response_data` |
| 7 | Drei Stunden später (R0: eine Messung ist kein Beweis): Postmark-Zählung des Fensters seit T1 — je Opt-in **genau ein** `optin_coach` und höchstens/genau ein `lead_access` (ZeroBounce-Skips als solche belegt), **kein** Doppel | Zählprotokoll |

**Rückweg (jederzeit, ohne Deploy):** `OPTIN_MAIL_MODUS` auf `aus` **und** Poller per API
wieder aktivieren — in dieser Reihenfolge (erst die neue Quelle stumm, dann die alte an;
niemals beide an). Der Poller nimmt liegengebliebene Kartei-Zeilen von selbst wieder auf
(Kandidaten-SQL kennt kein Zeitfenster ausser `activation_time`). Danach Lückenprüfung wie
Zeile 5, diesmal für das Outbox-Fenster.

**Frühwarnung:** Health-Issues (`optin_ohne_auftrag`, `optin_ohne_versandereignis`,
`outbox_dead_jobs`); Störungsmails des Monitors; die tägliche Zählung aus M7.

### M7 — Nachlauf: nachzählen, beobachten, nichts löschen

**Vorbedingung:** M6 abgeschlossen.

**Handlung, 14 Tage:**
- **Täglich** die Postmark-Nachzählung (§7) — nicht 2xx glauben, zählen.
- Täglich prüfen: `9RZdrLxfA8IRhd55` weiterhin inaktiv (API), `7Xg6NsE5H3UWgSNc`
  weiterhin aktiv und `matchedRows ≥ 1` bei Rang-Updates (Weg 3 muss die Kartei-Zeile
  weiter treffen — sie entsteht ja weiterhin über den Opt-in-Webhook, §9).
- `lead_processing_jobs`: es dürfen **keine neuen Zeilen** mehr entstehen (nur der
  Poller schrieb sie — Beleg: einziger Schreiber war `MySQL - Insert Pending Jobs`).
  Neue Zeile = jemand hat den Poller reaktiviert → Alarm.
- Wöchentlich `v_sync_dead_jobs` und `outbox_parked` auf Mail-Arten sichten.

**Beweis für den Abschluss:** 14 Tage, jede Zählung glatt, kein Doppel, keine Lücke,
Weg 3 ungestört.

**Rückweg:** wie M6.

### M8 — Aufräumen (erst nach M7-Beweis, frühestens 30 Tage nach M6)

- Poller-Workflow **löschen oder archivieren** — Entscheidung Markus; die Definition
  liegt doppelt gesichert (Repo-Backup aus M6 Zeile 1 + `n8n/export-2026-08-28/`).
  Bis dahin bleibt er deaktiviert stehen: ein inaktiver Workflow kostet nichts und ist
  der schnellste Rückweg.
- `MAILWEGE.md` umschreiben (Mail 1/2 kommen jetzt aus diesem Repo; Falle 4 und 6
  entfallen bzw. drehen sich um), `STAND-UND-FORTSETZUNG.md`: Entscheidung-3-Konflikt
  (zweiter Übergabepunkt) als geschlossen vermerken.
- Mautic-Passwort **rotieren** (§2 Sicherheitsbefund) — es steht im Klartext in
  Workflow-Sicherungen; nach dem Port braucht n8n es für diesen Weg nicht mehr.
  Vorher prüfen, welche anderen Workflows dieselbe Kennung nutzen (mindestens der
  Nurture-Sender spricht Mautic — Rotation ist ein eigener, koordinierter Handgriff,
  **nicht** en passant).
- Die Frage „was wird aus `typeform_surveys` und `lead_processing_jobs` langfristig"
  formell an das contacts-Projekt übergeben (§9).
- Das Set-Config-Segment-Loch `hu` (I7) an die Nurture-/Mautic-Pflege melden — es
  besteht unabhängig von M weiter, wandert aber mit dem Port in unseren Code und kann
  dort sauber entschieden werden (eigenes hu-Segment oder bewusst de).

---

## 7. Den stillen Ausfall bemerken: Nachzählen statt glauben

**Die Regel:** „Gesendet" in unserer Datenbank beweist keine Zustellung (Falle 7,
MAILWEGE — die 24 verbuchten, nie zugestellten Nurture-Mails vom 30.08. sind die
Referenzwunde). Beweisquelle für Versand ist **Postmark**, für Sollmenge unsere
`lead_events`.

**Die tägliche Zählung (M7, danach wöchentlich als Stichprobe):**

1. Sollmenge: `form_submitted`-Ereignisse des Tages aus `leads.lead_events`
   (plattform-eigen, deploy-fest).
2. Istmenge: Postmark `/messages/outbound?tag=optin_coach&…` und `?tag=lead_access&…`
   (`count` **und** `offset` Pflicht; Zeiten EDT → MESZ + 6 h; Metadata trägt ab M4
   `lead_hash` → Abgleich je Lead, nicht nur je Summe).
3. Urteil je Opt-in: genau 1 × `optin_coach`; genau 1 × `lead_access` **oder** ein
   belegter Skip (`lead_events`-Ereignis `lead_access_email_skipped` mit
   ZeroBounce-Grund — wird in M4 mitgeschrieben, damit der Skip vom Ausfall
   unterscheidbar ist; heute ist er es nicht).
4. Jede Abweichung ist ein Befund: 0 Mails = stiller Ausfall (Outbox-Job prüfen:
   `pending`? `dead`? gar nicht entstanden?); 2 Mails = Doppelversand (sofort M6-Rückweg
   erwägen und Ursache vor jedem weiteren Versand klären).

**Dauerhaft eingebaut** (nicht nur als Handritual): die zwei Health-Issues aus M4/6 —
`optin_ohne_auftrag` (30 min nach `form_submitted` kein Auftrag) und
`optin_ohne_versandereignis` (60 min danach kein Sent-/Skip-Ereignis). Der bestehende
15-Minuten-Monitor (`m52uJBbSQUFUA2Dm` → `/api/lead-system-health`) alarmiert per
Störungsmail — derselbe Kanal, der heute schon `outbox_dead_jobs` meldet. Damit hängt die
Entdeckung des stillen Ausfalls **nicht** an der Disziplin des täglichen Zählens.

---

## 8. Rückwege — Gesamtschau

| Stand | Rückweg | Aufwand |
| --- | --- | --- |
| M1 | Spiegel-Definition aus Sicherung zurückspielen (API-PUT) | Minuten |
| M2/M3 | keiner nötig (kein Laufzeitpfad) / Revert-PR | Minuten |
| M4 | Revert-PR; es sind keine Daten entstanden | < 1 h |
| M5 | `OPTIN_MAIL_MODUS=aus` (Env) | Minuten |
| M6/M7 | `OPTIN_MAIL_MODUS=aus`, **dann** Poller reaktivieren (API); Lückenprüfung | Minuten + Prüfprotokoll |
| nach M8 (Workflow gelöscht) | Import der gesicherten Definition, Credentials neu verknüpfen | Stunden — deshalb 30 Tage Karenz |

---

## 9. Die Kartei, `lead_processing_jobs` und der dritte Weg

**`typeform_surveys` wird weiter beschrieben, auch wenn niemand mehr pollt** — vom
Opt-in-Webhook (bis B4 über die alte Route, danach über `/webhook/quiz`) **und** von
Weg 3, der `points_rank`/`points_result` per `UPDATE … WHERE hash` in dieselbe Zeile
schreibt. Daraus folgt:

| Objekt | ab M6 | langfristig |
| --- | --- | --- |
| `typeform_surveys` | wächst weiter; niemand pollt sie mehr für Mails; Weg 3 aktualisiert weiter Ränge; die Kartei/CRM zeigt sie weiter an | Sache des contacts-Projekts. 🔴 **Offene Kopplung an Strang B:** ob die neue Route `/webhook/quiz` in **dieselbe** Tabelle schreibt (dann trifft Weg 3 weiter) oder in eine eigene (dann verfehlt `UPDATE … WHERE hash` künftige Zeilen und der Rang-Rückfluss bricht **still** — `matchedRows = 0` wirft im Worker allerdings einen Fehler, `api/bridge.js`-Muster `n8n_update_failed`, der Auftrag würde `failed`/`dead` und im Health-Monitor sichtbar). Das ist **vor** dem B-Umschalten (B4) zu klären, nicht in M — M vermerkt es hier als Wächterwissen: nach B4 muss ein Rang-Update nachweislich `matchedRows ≥ 1` liefern |
| `lead_processing_jobs` | bekommt keine neuen Zeilen mehr (einziger Schreiber war der Poller); Bestand bleibt als Historie stehen — **nicht löschen**, sie ist der Vergleichsmassstab für M5/M7-Auswertungen | Archivierung/Abbau zusammen mit der Alt-Routen-Stilllegung im contacts-Projekt (§9 des bridge-Plans: nach unserem Abzug und dem Wellnesscheck-Ende verliert die alte Route beide Grossnutzer) |
| Workflow `7Xg6NsE5H3UWgSNc` (Weg 3) | **bleibt aktiv und unangetastet** | erst ablösbar, wenn entschieden ist, ob die Kartei den Rang überhaupt noch braucht — eigenes Vorhaben, nicht M |

**Reihenfolge der Stilllegungen insgesamt:** M6 (Poller aus) ist von B4 (Routenwechsel)
technisch unabhängig — die Outbox-Mails brauchen die Kartei-Zeile nicht (alles kommt aus
Plattform-DB, Verzeichnis und lokalem Resume-Token). Die Vorgabe „M erst, wenn B ruhig
läuft" ist eine **Betriebs**-Regel (nie zwei Baustellen am Opt-in-Weg), keine technische
Abhängigkeit — sie gilt trotzdem (§10).

---

## 10. Reihenfolge und Abhängigkeiten zu Strang A und B

### 🔴 Warum M auf B warten muss — die harte Abhängigkeit, am Quelltext belegt

**Gemessen am 31.08.2026.** Die Abhängigkeit ist keine Vorsichtsregel, sondern eine
Datenlücke:

Der Berater, dem ein Kontakt **am Ende gehört**, steht erst nach der Übergabe fest. Bei
der Übergabe läuft die Doppelvergabe-Kontrolle (beraterübergreifende Suche,
4-Monats-Bestellfrist) und die Abo-Umleitung an die Upline — **dabei kann sich der Berater
ändern**, und genau dafür gibt es die Kontrolle.

| Route | Antwort | Erfährt das Quiz den aufgelösten Berater? |
| --- | --- | --- |
| **alt** `/webhook/typeform` | **leerer Rumpf** (`TypeformWebhookController::onReceive` endet auf `return;`) | 🔴 **nein** |
| **neu** `/webhook/quiz` | trägt `coach_member_id` und `case` | 🟢 ja |

**Beide Opt-in-Mails hängen daran**, nicht nur Mail 1:

- **Mail 1** geht an den Berater — bei einer Umleitung an den **falschen**, wenn das Quiz
  nur den Slug kennt.
- **Mail 2** geht zwar an den Lead, trägt aber die Berateridentität im Inhalt (u. a. den
  **WhatsApp-Link aus dem Berater-Telefon**, §2a der Übersicht).

Solange die alte Route leer antwortet, könnte das Quiz die Mails also nur mit dem
**Slug-Berater** verschicken — und würde bei jeder Umleitung still den Falschen
benachrichtigen. Das ist schlechter als der heutige Poller, der den Berater aus der
Kontakt-Historie liest.

**Ohne Strang B wäre M ein Rückschritt, kein Fortschritt.**

### ✅ M1 ist erledigt (31.08.2026, PR #128)

Die Vorlagen liegen im Repo: `server/optin-mail-bibliothek.js`, Rumpf **zeichengleich**
mit dem Extrakt, ein Driftwächter prüft das bei jedem Testlauf. Dazu goldene Muster für
vier Sprachen. **Aufgerufen wird nichts** — reine Vorbereitung.

Bestätigt dabei: Mail 2 ist übersetzt, **Mail 1 an den Berater ist durchgehend deutsch**.

#### 🔴 Befund: ungarische Opt-in-Mails verlieren heute Inhalte

Beim Port hat der Linter einen echten Fehler in der **laufenden** Bibliothek aufgedeckt —
am laufenden Workflow gegengeprüft, nicht nur am Extrakt:

In das Rückgabeobjekt von `getLocalizedLeadEmailPresentation` ist ein Block ungarischer
Zuordnungen hineingeraten (Zeilen 1154–1165), wo er wirkungslos ist — inklusive eines
**doppelten Schlüssels** `biztonsag`. Damit **fehlen** diese Einträge in der kanonischen
Zuordnung, die nur Deutsch, Italienisch, Englisch und Spanisch kennt.

| Begriff | Rückfall über Teilzeichenketten fängt ihn? |
| --- | --- |
| `kornyezet`, `lehetoseg` | ✅ ja |
| `biztonsag` (Barriere) | 🔴 **nein** |
| `szabadsag`, `hatas`, `stabilitas`, `novekedes` (alle Ziele) | 🔴 **keiner** |

**Wirkung heute:** Ungarische Leads bekommen eine Mail ohne Zielsetzung und teilweise ohne
die Angabe, was sie zurückhält.

🔴 **Bewusst nicht im Port behoben.** Der Port muss zeichengleich bleiben, sonst ist
„dieselbe Mail wie heute" nicht mehr beweisbar. Die Korrektur ist ein **eigener Schritt**
(neu: **M2a**) mit eigenem Vorher-Nachher-Beleg — sie ändert nutzersichtbaren Inhalt und
gehört nicht in einen Umbau versteckt.

**M2a, wenn es angefasst wird:** Die ungarischen Schlüssel gehören in
`LEAD_BARRIER_SLUG_MAP` bzw. `LEAD_EMAIL_ASPIRATION_KEYS`, der Fremdblock aus dem
Rückgabeobjekt raus, der doppelte `biztonsag` aufgelöst (Barriere `confidence`,
Ziel `security` — sie gehören in **verschiedene** Tabellen). Beweis: dieselbe Mail für
`de`/`it`/`en` wie vorher, für `hu` mit gefüllten Feldern.

### Was trotzdem **jetzt schon** geht — ohne B, ohne Laufzeitwirkung

| Schritt | Warum unabhängig |
| --- | --- |
| **M1/M2** — Vorlagen aus der n8n-Bibliothek portieren, mit Golden-Tests | Reiner Code plus Tests; nichts wird verschickt. Der Vergleich „zeichengleich zur heutigen Mail" lässt sich vollständig ohne B führen |
| **Inventur der Nebenaufgaben** vervollständigen (Mautic, ZeroBounce, Resume-Token, Jobverwaltung) | Lesen und Zuordnen |
| **M8 — Mautic-Geheimnis rotieren** | Der Wert stand im Klartext im Repo und ist damit verbrannt; die Rotation hängt an nichts |

### Reihenfolge, die daraus folgt

```text
A5  (Env-Umschaltung)         ── unabhängig, jederzeit sobald das Tor erreicht ist
B1 → B2 (contacts) → B3 → B4  ── der kritische Pfad
                                  │
M1/M2 (Vorlagen, jetzt schon) ────┤
                                  ▼
                         M3 … M8 (senden, Poller abschalten)
```



| Strang | Stand 31.08.2026 | Verhältnis zu M |
| --- | --- | --- |
| **A** — Berateridentität direkt aus MySQL (bridge-Plan §6, A1–A5) | geplant | **Kein Blocker für M.** M liest den Berater aus `leads.berater` (dem Spiegel der B-Reihe des Benachrichtigungsplans, seit 30.08. in Betrieb). 🔴 Berührung: M1 erweitert **denselben Spiegel** — M1 und A-Schritte nie am selben Tag; und falls A später den Spiegel durch Direktzugriff ersetzt, müssen die M-Felder (inkl. Telefon) in der A1-View mitgeführt werden — Notiz gehört in A1 |
| **B** — eigene Contacts-Route `/webhook/quiz` (bridge-Plan §6, B1–B5) | B1 (Vertrag) offen bis laufend | 🔴 **Vorgabe Markus: M beginnt erst, wenn B ruhig läuft** (operationalisiert in M4-Vorbedingung: B3-Beweis + 7 Tage Ruhe). Fachliche Kopplung: bei der neuen Route bleiben die **Mailschalter AUS**, weil die Mails hierher wandern — B und M sind zwei Hälften derselben Entscheidung. Technische Kopplung: nur über die Kartei-Zeile für Weg 3 (§9) — vor B4 zu klären |
| **B-Reihe des Benachrichtigungsplans** (B1–B4, `COACH_LOOKUP_SOURCE`) | B1/B2 erledigt, B3 wartet auf frische Vergleichszeilen | Zulieferer: M setzt auf `leads.berater` auf. **B3 muss nicht abgeschlossen sein**, bevor M1–M3 laufen (die sind lesend/tot), wohl aber bevor M5 aussagekräftig ist — sonst vergleicht der Schatten gegen einen Berater-Weg, der selbst noch im Schattenvergleich steckt. Sauber: B3/B4 abschliessen, dann M5 |
| **C1** (Extrakt) | Schritt 1 erledigt | Grundlage von M2; keine offenen Handlungen ausser denen, die M übernimmt |

**Gesamtreihenfolge:** M1 → M2 → M3 (parallel zu B-Restarbeiten möglich, da lesend/tot) →
[Warten: B ruhig + B-Reihe umgeschaltet] → M4 → 1 Werktag → M5 (≥ 7 Tage) → M6 (eine
Nacht) → M7 (14 Tage) → M8.

---

## 11. Risiken

| Risiko | Teuer weil | Gegenmittel |
| --- | --- | --- |
| 🔴 Doppelversand | Lead und Berater bekommen alles doppelt — unwiderruflich, vertrauensschädigend, mit Werbebudget skaliert | Drei Dedupe-Linien (4d); Umschaltreihenfolge „erst aus, dann scharf" (§5); Nachzählung (§7) |
| 🔴 Stiller Ausfall | Werbegeld läuft, niemand merkt, dass keine Mail kommt | Health-Issues eingebaut (M4/6), tägliche Postmark-Zählung (M7), Skip-Ereignisse machen ZeroBounce-Fälle vom Ausfall unterscheidbar |
| Falscher Berater durch Slug-statt-Kaskade | Lead landet beim falschen Menschen — nutzersichtbar | M1-Messung **vor** dem Bau; Entscheidung Markus bei Abweichung; Schattenvergleich M5 |
| Vorlagen-Drift beim Port | 350 Mails/Monat sähen anders aus | Drei Beweisebenen (§3), byteweise, mit Prüfsummen-Anker auf den Extrakt |
| Mautic-Lücke beim Übergang | Nurture-Eintritt bricht für neue Leads | `mautic_upsert` schaltet im selben M6-Akt um wie die Mails (eine Quelle je Zeitpunkt); Schatten vergleicht lesend (M5/3); Nurture-Sende-Nachweis nach M6 für einen neuen Lead |
| Weg 3 versehentlich mit abgeschaltet | Rang-Rückfluss in die Kartei bricht still | M6 Zeile 3: Aktiv-Gegenprüfung per ID; M7-Tagesprüfung `matchedRows` |
| Outbox-Stau verzögert Mails | Opt-in-Mail kommt Minuten statt Sekunden | Latenzmessung in M5; Priorisierung nur bei Messbefund |
| Poller-Reaktivierung durch Dritte | Doppelversand ab sofort | M7-Tagesprüfung; neue `lead_processing_jobs`-Zeile = Alarm; Team-Ansage in der Übergabe |
| n8n-Änderungen kaputt geschrieben | Spiegel/Poller-Definition zerstört | 🔴 immer: Sicherung → API-PUT → `versionId`-Wechsel prüfen — nie SQL (RAM-Cache) |

---

## 12. Offen / nicht belegt — ausdrücklich

1. **Wer liest die Statusspalten in `lead_processing_jobs`** (`coach_email_sent_at`,
   `mautic_contact_id`, …) und `typeform_surveys.points_result` in der
   Kartei-Oberfläche? Im Quiz-Repo nicht feststellbar; contacts-Quelltext wurde für
   diesen Plan nicht gelesen. → vor M6 beim contacts-Projekt anfragen; bis dahin
   Grundannahme „bleibt leer, Tabelle unangetastet" (I11).
2. **Schreibt die künftige Route `/webhook/quiz` in `typeform_surveys`?** Entscheidet
   über Weg 3 nach B4 (§9). Gehört in den B1-Vertrag, nicht in M — hier nur als
   Kopplung vermerkt.
3. **Häufigkeit der Zuordnungsdifferenz** Kaskade vs. Slug (I3) — Messung ist M1-Inhalt,
   Zahl fehlt noch.
4. **Echte Golden-Fälle für fr/ru/hu** — ob es je Sprache eine real versendete Mail
   gibt, zeigt erst der Postmark-Abruf in M2 (hu-Opt-ins existieren — 3 Menschen mit
   `unsupported_language:hu` in der Nurture — aber ob eine `lead_access`-Mail auf hu
   versendet wurde, ist nicht geprüft).
5. **Mautic-Duplikatverhalten**: dass Suche→Create/Update bei parallelen Schreibern
   keine Duplikate erzeugt, wird in M nicht gebraucht (eine Quelle je Zeitpunkt), bleibt
   aber unbewiesen — deshalb kein „Mautic schon mal vorziehen".
6. **`default`-Slug-Leads**: heute kann die Kaskade ihnen über `contacts.coach_id`
   trotzdem einen Berater geben; der Slug-Weg kennt `default` nicht (kein
   `users`-Satz — B-Reihe-Messung vom 30.08.). Wie oft das vorkommt → M1-Messung;
   Entscheidung dann bei Markus.
7. **Name der Schalter-Variable** (`OPTIN_MAIL_MODUS` vs. `OPTIN_OUTBOX_EMAIL_ENABLED`
   aus dem alten Plan §4/3): dieses Dokument schlägt die Drei-Zustands-Form vor, weil
   sie den Schattenlauf ohne zweite Variable trägt — bei Umsetzung festzurren und im
   alten Plan nachtragen.
8. **SSH auf `167.233.251.217` fehlt** (B2a-Befund) — für M nicht erforderlich (alles
   läuft über Coolify-, n8n- und Postmark-APIs plus CI-Deploys), aber als bekannte
   Einschränkung notiert.
