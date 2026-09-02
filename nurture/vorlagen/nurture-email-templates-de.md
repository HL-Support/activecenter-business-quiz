# Nurture Email Templates — Deutsch (Master)

**Version:** 1.0  
**Sprache:** DE  
**System:** Mautic (Personalisierung via `{contactfield=...}`)  
**Humanizer:** Erstellt nach anti-ai-slop-humanizer Regeln

**Mautic-Tokens:**
- `{contactfield=firstname}` — Vorname Lead
- `{contactfield=ac_last_profile_label}` — Typ-Label (z.B. "Der Macher")
- `{contactfield=ac_last_main_goal_label}` — Aspiration-Label
- `{contactfield=ac_last_barrier}` — Barriere-Code (vehicle/community/confidence/opportunity)
- `{contactfield=ac_last_video_access_url}` — Resume-Link (permanent)
- `{contactfield=ac_berater_vorname}` — Vorname Coach
- `{contactfield=ac_berater_name}` — Nachname Coach
- `{contactfield=ac_berater_whatsapp}` — Coach WhatsApp-Nummer
- `{contactfield=ac_berater_email}` — Coach E-Mail
- `{unsubscribe_url}` — Mautic Unsubscribe

**Profil-Codes:**
- R = Feuer = "Der Macher"
- Y = Wind = "Der Netzwerker"
- G = Wasser = "Der Anker"
- B = Fels = "Der Architekt"

**Barriere-Codes:**
- vehicle = kein System/kein Startpunkt
- community = kein passendes Umfeld
- confidence = innerer Zweifel, fehlende Sicherheit
- opportunity = sieht die Gelegenheit (noch) nicht

---

## EMAIL A2 — Tag 2 nach Registration (State 0)
**Format:** Story-Email (~350 Wörter)  
**Trigger:** 2 Tage nach `form_submitted_at`, wenn `lifecycle_stage = registered`

### Betreffzeilen (Aspiration-spezifisch)
- **freedom:** `Was Freiheit für jemanden mit deinem Profil bedeutet, {contactfield=firstname}`
- **impact:** `{contactfield=firstname}, wie du wirklich etwas veränderst — das zeigt Video 1`
- **security:** `Ein stabiles Fundament bauen ohne alles auf den Kopf zu stellen, {contactfield=firstname}`
- **growth:** `{contactfield=firstname}, warum Wachstum bei dir anders aussieht`

---

### VERSION FREEDOM — A2

Hi {contactfield=firstname},

vor zwei Jahren hat Stefan, Vertriebsleiter aus München, jeden Montagmorgen denselben Gedanken gehabt.

Nicht schon wieder.

Den Job hasste er nicht mal. Er wollte einfach Optionen. Irgendetwas das zählt, wenn er nicht da ist. Heute plant er seinen Montag selbst. Kein Chef, kein fester Ort, kein Rahmen der ihm passt aber ihm nicht gehört.

Was hat er gemacht? Er hat sich ein zweites Standbein aufgebaut. Mit demselben Ausgangspunkt den du hast.

Dein Erfolgscode zeigt, dass du weißt was du willst — und dass du nicht auf Erlaubnis wartest. Genau dieser Typ baut am schnellsten, wenn das Modell passt. Video 1 zeigt dir die Mechanik dahinter. 8 Minuten. Dann weißt du ob es zu dir passt oder nicht.

*[TYPE-SPECIFIC CTA — Mautic Dynamic Content nach ac_last_profile]*

**Feuer:** `[Jetzt anschauen — 8 Minuten reichen aus]`

**Wind:** `[Reinschauen — lass das Bild auf dich wirken]`

**Wasser:** `[Hier siehst du was dich erwartet — ohne Druck, ohne Deadline]`

**Fels:** `[Die Struktur dahinter verstehen — Video 1 ansehen]`

---

{contactfield=ac_berater_vorname}

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION IMPACT — A2

Hi {contactfield=firstname},

Lisa war Lehrerin. 14 Jahre. Sie hat gemocht was sie tat. Aber sie hatte das Gefühl, dass ihre Wirkung an der Schultür aufhört.

Heute berät sie Menschen in 4 Ländern. Nicht weil sie alles umgeworfen hat. Weil sie einen Weg gefunden hat, das was sie ohnehin tut — Menschen wirklich weiterbringen — in etwas zu übersetzen das mehr Reichweite hat.

Dein Profil zeigt das gleiche Muster: jemand der nicht nur für sich denkt. Der Moment wenn du Video 1 siehst, wirst du verstehen warum dein Typ in diesem Modell anders wirkt als die meisten.

Kein Hochglanz. Kein Versprechen. Nur das was es wirklich ist.

*[TYPE-SPECIFIC CTA nach ac_last_profile]*

**Feuer:** `[8 Minuten. Danach entscheidest du selbst.]`

**Wind:** `[Schau rein und spür ob das zu dir passt]`

**Wasser:** `[Ich erkläre dir zuerst was dich erwartet — dann entscheidest du]`

**Fels:** `[Wie das Modell wirklich funktioniert — Video 1]`

---

{contactfield=ac_berater_vorname}

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION SECURITY — A2

Hi {contactfield=firstname},

Marco hatte einen guten Job. Familie, Haus, laufende Kosten. Er wollte nichts riskieren — er wollte ein zweites Standbein aufbauen das hält, während er weitermacht wie bisher.

Heute hat er beides.

Er hat nicht gekündigt. Hat nichts auf den Kopf gestellt. Er hat neben seinem Alltag etwas aufgebaut das inzwischen mehr einbringt als sein Nebenjob früher. Der Unterschied: er hatte ein Modell das für seinen Typ funktioniert.

Dein Erfolgscode zeigt, dass du genauso denkst. Solide, langfristig, nichts dem Zufall überlassen. Video 1 zeigt dir, wie das konkret aussieht — kein Hype, nur Struktur.

*[TYPE-SPECIFIC CTA nach ac_last_profile]*

**Feuer:** `[Direkt rein — du brauchst Fakten, keine Versprechen]`

**Wind:** `[Lass das Video auf dich wirken — 8 Minuten]`

**Wasser:** `[Hier ist was dich in Video 1 erwartet. Kein Druck, kein Pitch.]`

**Fels:** `[Das Modell vollständig verstehen — Video 1 ansehen]`

---

{contactfield=ac_berater_vorname}

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION GROWTH — A2

Hi {contactfield=firstname},

David hat in seinem Job alles bekommen was er wollte. Beförderung, Gehalt, Titel. Trotzdem hatte er das Gefühl, auf der Stelle zu treten.

Das Problem war nicht der Job. Das Problem war das Umfeld. Er war der Klügste im Raum.

Seit er dieses Modell aufgebaut hat, ist das anders. Er ist umgeben von Menschen die ihn fordern. Unternehmer, Coaches, Menschen die wirklich etwas aufbauen. Sein Einkommen ist gewachsen. Mehr noch: er selbst ist gewachsen.

Dein Profil zeigt dasselbe Muster: du hörst nie auf. Kein Plateau hält dich lange. Video 1 zeigt dir, welches Umfeld und welches Modell zu jemandem mit deinem Antrieb passt.

*[TYPE-SPECIFIC CTA nach ac_last_profile]*

**Feuer:** `[Was ist drin — 8 Minuten, du entscheidest danach]`

**Wind:** `[Das Umfeld dahinter — sieh selbst wer dabei ist]`

**Wasser:** `[Schritt für Schritt erklärt — Video 1]`

**Fels:** `[Das Framework dahinter — Video 1 ansehen]`

---

{contactfield=ac_berater_vorname}

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL A3 — Tag 5 nach Registration (State 0)
**Format:** Empathie-Email (~280 Wörter)  
**Trigger:** 5 Tage nach `form_submitted_at`, wenn kein Video angeschaut

### Betreffzeile (universell)
`Ich weiß was dich bremst, {contactfield=firstname}`

---

### VERSION VEHICLE (kein System, kein Startpunkt) — A3

Hi {contactfield=firstname},

weißt du was die meisten sagen wenn ich frage warum sie noch nicht angefangen haben?

"Ich weiß nicht wie."

Nicht: ich will nicht. Nicht: es interessiert mich nicht. Einfach: ich sehe keinen klaren ersten Schritt.

Das ist menschlich. Und es ist genau das was Video 1 löst.

Das Video ist keine Motivationsrede. Es zeigt dir, wie das Modell gebaut ist. Was der erste Schritt ist. Was realistisch möglich ist und in welchem Zeitraum.

Danach kannst du selbst beurteilen ob das für dich passt. Nicht ich.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION COMMUNITY (kein passendes Umfeld) — A3

Hi {contactfield=firstname},

weißt du was mich an den meisten "Business-Möglichkeiten" stört?

Du machst das alleine. Kein Rückhalt, kein Team, niemand der versteht was du gerade aufbaust.

Das ist bei weitem der häufigste Grund warum gute Leute aufhören. Nicht weil das Modell nicht funktioniert. Weil sie alleine waren.

Was hier anders ist — das zeigt Video 1. Nicht als Verkaufsargument. Einfach weil es die Frage beantwortet: wer ist da wenn es schwierig wird?

Schau es dir an. 8 Minuten.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION CONFIDENCE (innerer Zweifel) — A3

Hi {contactfield=firstname},

"Bin ich überhaupt der Typ dafür?"

Diese Frage höre ich öfter als jede andere. Von Menschen die klug sind, die anpacken können, die eigentlich genau das mitbringen was es braucht.

Zweifel ist kein Zeichen von Schwäche. Er ist meistens ein Zeichen dass dir etwas wichtig ist.

Ich sage dir nicht dass du es schaffst. Das wäre leer. Ich zeige dir in Video 1, was Menschen mit deinem Profil aufgebaut haben — damit du selbst beurteilen kannst ob das realistisch klingt. Nicht ich.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION OPPORTUNITY (Gelegenheit noch nicht klar) — A3

Hi {contactfield=firstname},

manchmal ist das Problem nicht die Entscheidung. Das Problem ist, dass man noch nicht wirklich verstanden hat was da eigentlich angeboten wird.

Das ist fair. Ich erkläre schlecht wenn ich zu wenig Zeit habe.

Video 1 macht das besser als ich es in einer Mail könnte. Es zeigt dir konkret: was ist das Modell, wer macht das, was bringt es realistisch. Keine 45-Minuten-Präsentation. 8 Minuten, direkt auf den Punkt.

Wenn du danach sagst "das ist nichts für mich" — völlig okay. Dann weißt du es.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL A4 — Tag 10 nach Registration (State 0)
**Format:** Testimonial-Email (~300 Wörter)  
**Trigger:** 10 Tage nach `form_submitted_at`, wenn kein Video  
**Hinweis:** Typ-matching in der Story empfohlen — Mautic Dynamic Content nach `ac_last_profile`

### Betreffzeile (Typ-spezifisch)
- **Feuer:** `Was {contactfield=firstname} und Thomas gemeinsam haben`
- **Wind:** `Wie Claudia angefangen hat — und warum das zu dir passt, {contactfield=firstname}`
- **Wasser:** `{contactfield=firstname}, hier ist jemand der genauso gedacht hat wie du`
- **Fels:** `Was Michael nach 6 Monaten Analyse gemacht hat, {contactfield=firstname}`

---

### VERSION FEUER — A4

Hi {contactfield=firstname},

Thomas war Verkaufsleiter. 47 Jahre alt, gut im Job, keine Zeit für Experimente. Er hat das Quiz ausgefüllt, zwei Wochen gewartet, dann das Video angeschaut. Aus Neugierde.

Heute baut er nebenbei ein Team auf. Nicht weil er alles auf den Kopf gestellt hat. Weil das Modell genau so aufgebaut ist wie sein Kopf funktioniert: klare Struktur, klare Ziele, keine Umwege.

In 14 Monaten hat er mehr verdient als in seinem ersten Jahr im alten Job. Ich rede das nicht schön — er würde dir dasselbe sagen.

Was hatte er, das du auch hast? Den gleichen Typ. Den gleichen Antrieb. Den gleichen Hunger.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — jetzt — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION WIND — A4

Hi {contactfield=firstname},

Claudia kommt aus dem Eventmanagement. Sie liebt Menschen, liebt Energie, liebt wenn Dinge passieren. Das Problem: ihr Job hat sie rund um die Uhr gebraucht.

Sie wollte etwas, das mit ihr wächst — nicht etwas das sie aufbraucht.

Heute macht sie genau das, was sie immer gemacht hat: Menschen zusammenbringen, begeistern, Türen öffnen. Aber auf ihre eigenen Bedingungen. In 8 Monaten hat sie ein kleines Team aufgebaut das ohne sie weiterläuft, wenn sie in Urlaub ist.

Ihr Erfolgscode sah genauso aus wie deiner.

{contactfield=ac_berater_vorname}

`[Schau rein — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION WASSER — A4

Hi {contactfield=firstname},

Sandra ist Krankenschwester. Helferin durch und durch. Sie zweifelt an fast allem — besonders an sich selbst. Als sie das Quiz gemacht hat, hat sie danach 3 Wochen nichts getan.

Dann hat sie doch angefangen.

Nicht weil sie plötzlich mutig war. Weil ihr Coach ihr gesagt hat: du musst heute nichts entscheiden. Schau dir einfach das Video an.

Heute hat sie ein Nebeneinkommen das ihrer Familie mehr Spielraum gibt. Kein Druck, kein Hype. Einfach etwas das funktioniert, wenn man es lässt.

{contactfield=ac_berater_vorname}

`[Video 1 ansehen — {contactfield=ac_last_video_access_url}]`

*Kein Druck. Du schaust, du beurteilst selbst.*

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION FELS — A4

Hi {contactfield=firstname},

Michael ist Ingenieur. Er hat 6 Monate lang analysiert bevor er angefangen hat. Spreadsheets, Fragen, Vergleiche mit anderen Modellen.

Dann hat er angefangen.

Nicht weil er aufgehört hat zu analysieren — sondern weil er genug Daten hatte um eine Entscheidung zu treffen. In 18 Monaten hat er das Modell so weit verstanden, dass er es optimiert hat auf eine Art, die selbst mein Coach beeindruckt hat.

Was mich an ihm interessiert hat: nicht dass er schnell war. Dass er gründlich war. Genau das vermisse ich bei vielen.

{contactfield=ac_berater_vorname}

`[Video 1 — Die Grundlagen verstehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL A5 — Tag 21 nach Registration (State 0)
**Format:** Persönlicher Check-in (~150 Wörter)  
**Trigger:** 21 Tage nach `form_submitted_at`, wenn kein Video  
**Danach:** Übergang in Evergreen-Phase

### Betreffzeile
`Kurze Frage, {contactfield=firstname}`

---

### TEXT — A5 (universell, kein Druck)

Hi {contactfield=firstname},

ich wollte kurz nachfragen.

Du hast das Quiz ausgefüllt, das Ergebnis gesehen — und seitdem nichts getan. Das ist völlig in Ordnung. Ich mache mir keine Sorgen.

Mich interessiert nur: gibt es etwas das unklar ist? Etwas das dich hält?

Wenn ja, antworte einfach auf diese Mail. Kein Verkaufsgespräch, kein Skript. Ich lese das selbst und antworte.

Wenn der Zeitpunkt gerade einfach nicht passt — auch okay. Du hörst von mir, wenn ich etwas Konkretes habe.

{contactfield=ac_berater_vorname}

`[Falls doch: Video 1 ist hier — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL B1 — 24h nach Video 1 (State 1, kein V2)
**Format:** Hybrid Short+Story (~250 Wörter)  
**Trigger:** 24h Inaktivität nach `video_1_watched_at`, wenn `video_2_watched_at` leer

### Betreffzeile (Typ-spezifisch)
- **Feuer:** `Was du in Video 1 gesehen hast, ist erst der Anfang, {contactfield=firstname}`
- **Wind:** `{contactfield=firstname} — Video 2 zeigt dir die Menschen dahinter`
- **Wasser:** `Der nächste Schritt ist einfacher als du denkst, {contactfield=firstname}`
- **Fels:** `{contactfield=firstname}, Video 2 erklärt die Mechanik die Video 1 nur angedeutet hat`

---

### VERSION FEUER — B1

Hi {contactfield=firstname},

Video 1 hat dir gezeigt was das Modell ist.

Video 2 zeigt dir wie es skaliert. Das ist der Unterschied zwischen einem guten Nebenbereich und einem echten zweiten Standbein.

Leute mit deinem Profil bauen das schneller auf als sie denken — weil sie nicht zögern wenn das System klar ist. Video 2 macht es klar.

12 Minuten.

{contactfield=ac_berater_vorname}

`[Video 2 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION WIND — B1

Hi {contactfield=firstname},

weißt du was das Besondere an diesem Modell für jemanden wie dich ist?

Es funktioniert über Menschen. Nicht trotzdem — genau deswegen.

Video 2 zeigt dir, wie andere Netzwerker dieses Modell aufgebaut haben. Echte Gesichter, echte Geschichten. Kein Whiteboard, kein Zahlen-Vortrag. Einfach Menschen die erzählen was sie gemacht haben.

{contactfield=ac_berater_vorname}

`[Video 2 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION WASSER — B1

Hi {contactfield=firstname},

du hast Video 1 gesehen. Gut.

Video 2 geht einen Schritt tiefer — nicht schneller, nicht lauter. Es zeigt dir wie das Modell im Alltag wirklich aussieht. Was der zweite Monat bringt, was der erste Jahr realistisch bedeutet.

Kein Druck. Schau es dir einfach an wenn du einen ruhigen Moment hast.

{contactfield=ac_berater_vorname}

`[Video 2 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION FELS — B1

Hi {contactfield=firstname},

Video 1 hat die Oberfläche gezeigt.

Video 2 erklärt die Struktur dahinter: wie das Einkommensmodell aufgebaut ist, wie die Skalierung funktioniert, warum das Modell auch ohne ständige Aktivität läuft. Das sind die Fragen die jeder stellt der wirklich hinschaut — und die Antworten sind besser als du wahrscheinlich erwartest.

{contactfield=ac_berater_vorname}

`[Video 2 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EMAIL B2 — B+3 Tage (State 1, kein V2)
**Format:** Framework-Insight (~300 Wörter)  
**Trigger:** 3 Tage nach B1, wenn noch kein V2

### Betreffzeile (Typ-spezifisch)
- **Feuer:** `Warum Macher mit diesem Modell schneller skalieren als andere`
- **Wind:** `{contactfield=firstname}, das Geheimnis das Netzwerker hier von Anfang an im Vorteil stehen`
- **Wasser:** `Warum gerade ruhige, verlässliche Menschen hier am weitesten kommen`
- **Fels:** `{contactfield=firstname}, das systemische Prinzip hinter diesem Modell`

---

### TEXT — B2 (4 Typ-Varianten)

**FEUER:**

Hi {contactfield=firstname},

es gibt einen Grund warum Menschen mit deinem Profil in diesem Modell schneller vorankommen als der Durchschnitt.

Sie analysieren nicht zu lange. Sie starten, korrigieren, bauen.

Das Modell ist dafür gemacht: klare Schritte, klare Ziele, kein Warten auf Perfektion. Wer anfängt hat einen Vorsprung vor jedem der noch überlegt. Video 2 zeigt dir den Aufbau — damit du selbst beurteilen kannst ob dein Tempo hier passt.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**WIND:**

Hi {contactfield=firstname},

der größte Vorteil den Netzwerker in diesem Modell haben, wird selten ausgesprochen.

Sie brauchen nicht kalt akquirieren. Sie teilen einfach was sie erlebt haben — und wer neugierig ist, meldet sich. Das ist der Unterschied zwischen Verkaufen und Einladen. Du hast diese Gabe. Video 2 zeigt dir wie andere Netzwerker das konkret umgesetzt haben.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**WASSER:**

Hi {contactfield=firstname},

weißt du wer in diesem Modell am beständigsten aufbaut?

Nicht die Lautesten. Die Verlässlichsten.

Menschen die einfach weitermachen, Monat für Monat. Keine Wunderergebnisse in Woche drei — aber nach 12 Monaten ein stabiles Einkommen das hält. Genau das ist dein Vorteil. Video 2 zeigt dir den Aufbauplan dahinter.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**FELS:**

Hi {contactfield=firstname},

hier ist das systemische Prinzip das die meisten übersehen:

Das Modell hat zwei Einkommensquellen. Eine funktioniert ohne Team, eine wächst durch Team. Beide laufen parallel. Das ist kein Zufall — das ist der Grund warum es skaliert ohne dass du täglich aktiv sein musst.

Video 2 erklärt das vollständig. Ohne Vereinfachung.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL C1 — 24h nach Video 2 (State 2, kein V3)
**Format:** Testimonial-Email (~280 Wörter)  
**Trigger:** 24h Inaktivität nach `video_2_watched_at`, wenn `video_3_watched_at` leer

### Betreffzeile
`{contactfield=firstname}, Video 3 ist das persönlichste von allen`

---

### TEXT — C1 (universell + Typ-spezifisches Zitat)

Hi {contactfield=firstname},

du hast gesehen wie das Modell aufgebaut ist. Jetzt kommt Video 3.

Das ist kein Strategievideo. Es ist kein Zahlenblock. Es sind Menschen, die erzählen was sie durchgemacht haben — bevor sie angefangen haben, und was danach passiert ist.

*[Mautic Dynamic Content nach ac_last_profile — je Typ ein anderes Zitat]*

**Feuer:**
> "Ich habe 3 Monate gewartet weil ich dachte, ich muss noch mehr wissen. Das war ein Fehler. Die besten Entscheidungen habe ich getroffen als ich einfach angefangen habe."
> — Thomas, Vertriebsleiter, 14 Monate im Modell

**Wind:**
> "Was mich überzeugt hat war nicht die Zahl auf dem Konto. Es war das Gespräch mit jemandem der genauso tickt wie ich — und einfach gesagt hat: das funktioniert, ich zeig dir wie."
> — Claudia, Eventmanagerin, 8 Monate im Modell

**Wasser:**
> "Ich habe nicht geglaubt dass ich das schaffe. Mein Coach hat mich nicht überredet. Er hat mir Zeit gegeben. Das war der Unterschied."
> — Sandra, Krankenschwester, 11 Monate im Modell

**Fels:**
> "Ich habe alles geprüft bevor ich angefangen habe. Alles hat gestimmt. Was ich nicht erwartet hatte: dass ich nach einem Jahr das Modell selbst optimiert habe."
> — Michael, Ingenieur, 18 Monate im Modell

Video 3 hat mehr davon. Echte Menschen, echte Situationen.

{contactfield=ac_berater_vorname}

`[Video 3 ansehen — {contactfield=ac_last_video_access_url}]`

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EMAIL C2 — C+3 Tage (State 2, kein V3)
**Format:** Multi-Proof (~300 Wörter)

### Betreffzeile (Typ-spezifisch)
- **Feuer:** `Zwei Beispiele die zeigen was mit deinem Profil möglich ist`
- **Wind:** `{contactfield=firstname}, drei Menschen die genauso gestartet haben wie du`
- **Wasser:** `{contactfield=firstname} — was passiert wenn du einfach anfängst`
- **Fels:** `Reale Ergebnisse: 6 Monate, 12 Monate, 18 Monate im Vergleich`

---

### TEXT — C2 (Typ-spezifische Proof-Auswahl)

**FEUER:**

Hi {contactfield=firstname},

zwei Zahlen aus dem letzten Jahr:

Annette, 39, Teamleiterin: nach 6 Monaten 1.400 € Nebeneinkommen, nach 14 Monaten ersetzt das ihren alten Nebenjob vollständig.

Rafael, 44, Selbstständiger: 9 Monate bis er aufgehört hat zu zweifeln, 3 Monate danach war er profitabel.

Beide hatten deinen Typ. Beide haben nicht auf den perfekten Moment gewartet. Video 3 zeigt dir warum.

`[Video 3 ansehen — {contactfield=ac_last_video_access_url}]`

---

**WIND:**

Hi {contactfield=firstname},

weißt du was alle Menschen in meinem Team gemeinsam haben die am weitesten gekommen sind?

Sie haben nicht alleine angefangen. Sie hatten jemanden der ihnen zeigt wie es geht.

Julia hat in 7 Monaten ein Team von 12 Personen aufgebaut. Nicht weil sie besonders talentiert ist — sondern weil sie Menschen begeistert. So wie du.

Video 3 zeigt dir ihre Geschichte, und die Geschichte von zwei anderen die genauso gestartet haben.

`[Video 3 ansehen — {contactfield=ac_last_video_access_url}]`

---

**WASSER:**

Hi {contactfield=firstname},

ich schicke dir keine Versprechen.

Nur das hier: Bernd, 52, Lehrer. Hat 10 Monate gebraucht bis er angefangen hat. Dann hat er aufgebaut, langsam, verlässlich. Nach 2 Jahren ist sein Nebeneinkommen stabiler als sein Gehalt schwankt.

Er hat gesagt: das Einzige was ich bereue ist, dass ich nicht früher das Video angeschaut habe.

`[Video 3 ansehen — {contactfield=ac_last_video_access_url}]`

---

**FELS:**

Hi {contactfield=firstname},

hier sind reale Einkommensverläufe aus meinem Netzwerk, anonymisiert:

Profil Typ B, Startmonat Januar: Monat 6: €890 | Monat 12: €2.100 | Monat 18: €3.400

Das ist kein Ausreißer. Das ist das Muster wenn jemand mit deiner Systematik arbeitet.

Video 3 erklärt den Aufbau dahinter. Ohne Schönreden.

`[Video 3 ansehen — {contactfield=ac_last_video_access_url}]`

---

*{contactfield=ac_berater_vorname}*

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL D1 — 24h nach Video 3 (State 3, kein CTA)
**Format:** Direkte Entscheidungs-Email (~280 Wörter)  
**Trigger:** 24h nach `video_3_watched_at`, wenn kein CTA

### Betreffzeile (Aspiration-spezifisch)
- **freedom:** `{contactfield=firstname}, du hast alle Videos gesehen — was hält dich jetzt noch zurück?`
- **impact:** `{contactfield=firstname}, was wäre wenn du morgen anfängst?`
- **security:** `Du hast alle Informationen, {contactfield=firstname}. Was fehlt noch?`
- **growth:** `{contactfield=firstname} — der nächste Schritt ist ein Gespräch, nicht mehr`

---

### TEXT — D1 (universell, Aspiration-Hook am Anfang)

Hi {contactfield=firstname},

du hast alle drei Videos angeschaut. Du weißt wie das Modell funktioniert, was es realistisch bringt, wer damit gestartet hat.

*[Aspiration-Hook — Mautic Dynamic Content]*

**freedom:** Jetzt ist die Frage einfach: willst du weiter im gleichen Rhythmus, oder willst du anfangen Optionen aufzubauen?

**impact:** Du hast gesehen was möglich ist. Für Menschen die anderen helfen wollen, gibt es hier genug Raum.

**security:** Du hast alle Fakten. Das Risiko ist überschaubar — das haben die Videos gezeigt.

**growth:** Du hast gesehen was Menschen mit deinem Antrieb hier aufgebaut haben. Die Frage ist wann, nicht ob.

---

Der nächste Schritt ist ein Gespräch. Kein Pitch, kein Druck. Einfach eine offene Runde mit {contactfield=ac_berater_vorname} — 20 bis 30 Minuten.

Schreib einfach direkt:

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oder antworte auf diese Mail.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL D2 — D+3 Tage (State 3, kein CTA)
**Format:** Einwand-Email (~350 Wörter)  
**Trigger:** 3 Tage nach D1, wenn kein CTA

### Betreffzeilen (Barriere-spezifisch)
- **vehicle:** `"Ich weiß nicht wo ich anfangen soll" — das beantwortet dieses Gespräch`
- **community:** `{contactfield=firstname}, du brauchst das nicht alleine herausfinden`
- **confidence:** `{contactfield=firstname}, der Zweifel ist berechtigt. Hier ist meine ehrliche Antwort.`
- **opportunity:** `Was das Modell wirklich bringt — keine Hochglanzversion, {contactfield=firstname}`

---

### VERSION VEHICLE — D2

Hi {contactfield=firstname},

"Wo fange ich an?" ist die häufigste Frage die ich höre von Menschen die alle Videos gesehen haben und trotzdem nicht zum nächsten Schritt kommen.

Das ist kein Zeichen von Schwäche. Es ist der Moment wo ein Gespräch mehr bringt als ein weiteres Video.

In 20 Minuten beantworte ich dir:
- Was ist dein realistischer erster Schritt
- Was kostet dich das am Anfang wirklich (Zeit, Geld)
- Was passiert in Monat 1, 2, 3

Danach hast du Klarheit — egal wie du dich entscheidest.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oder antworte auf diese Mail.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION COMMUNITY — D2

Hi {contactfield=firstname},

das hier soll kein Vortrag werden. Nur eine ehrliche Frage:

Gibt es jemanden in deinem Umfeld der das schon macht, der dir sagen kann wie es wirklich ist?

Wenn nein — das ist das Problem. Nicht das Modell.

Ich bin dafür da. Nicht als Coach der dir etwas verkauft. Als Mensch der weiß wie es ist, alleine vor einer Entscheidung zu stehen die niemand im eigenen Umfeld versteht.

20 Minuten. Offen. Ehrlich.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION CONFIDENCE — D2

Hi {contactfield=firstname},

ich werde dir nicht sagen dass du es schaffst. Das wäre billig.

Was ich dir sagen kann: die Menschen die ich erlebt habe die am meisten gezweifelt haben, waren oft genau die die am weitesten gegangen sind. Weil Zweifel bedeutet dass du ernst nimmst was du tust.

Das Gespräch das ich dir anbiete ist kein Motivationsgespräch. Es ist ein ehrliches Gespräch darüber was dich hält — und ob das wirklich ein Grund ist oder eine Schutzreaktion.

Du entscheidest danach selbst.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oder antworte einfach hier.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

### VERSION OPPORTUNITY — D2

Hi {contactfield=firstname},

vielleicht hast du die Videos gesehen und gedacht: klingt gut — aber was bringt das wirklich?

Das ist die ehrlichste Frage die man stellen kann.

Ich beantworte sie nicht mit Zahlen die ich raussuche. Ich beantworte sie mit dem was ich in meinem Netzwerk gesehen habe: was haben Menschen in 6 Monaten aufgebaut, was haben sie investiert, was hat nicht funktioniert.

Alles davon — ohne Schönreden — in 20 Minuten.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL D3 — D+7 Tage (State 3, kein CTA)
**Format:** Kurz + echte Einladung (~130 Wörter)  
**Trigger:** 7 Tage nach D1, wenn kein CTA  
**Danach:** Evergreen-Phase startet

### Betreffzeile
`Letzte Nachricht von mir für eine Weile, {contactfield=firstname}`

---

### TEXT — D3

Hi {contactfield=firstname},

ich werde dich jetzt nicht mehr jede Woche anschreiben.

Nicht weil es mich nicht interessiert. Sondern weil du alles weißt was du wissen musst. Mehr Information hilft da nicht.

Wenn du irgendwann bereit bist, bin ich da. Einfach schreiben — kein Prozess, keine Wartezeit.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

Du hörst von mir wieder wenn ich etwas habe das wirklich relevant für dich ist.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EMAIL E1 — Post-CTA (sofort nach CTA-Klick)
**Format:** Warm Welcome (~200 Wörter)

### Betreffzeile
`{contactfield=firstname}, deine Anfrage ist angekommen`

---

### TEXT — E1

Hi {contactfield=firstname},

ich habe deine Nachricht bekommen.

Gut dass du dich gemeldet hast.

Ich melde mich in den nächsten 24 Stunden bei dir — per WhatsApp oder E-Mail, je nachdem wie du es geschrieben hast. Kein Skript, kein Verkaufsgespräch. Einfach eine offene Runde in der wir schauen ob und wie das für dich passt.

Was du mitbringen kannst wenn du möchtest: deine wichtigste Frage. Die eine Sache die du noch nicht verstehst oder noch nicht siehst.

Ich freue mich auf das Gespräch.

{contactfield=ac_berater_vorname}  
{contactfield=ac_berater_email}  
WhatsApp: {contactfield=ac_berater_whatsapp}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EVERGREEN EMAIL EV1 — Monat 1
**Typ:** Value/Insight  
**Trigger:** Erster Monat nach Ende der Aktivierungsphase

### Betreffzeile
`{contactfield=firstname}, ein Gedanke der bei mir hängengeblieben ist`

---

### TEXT — EV1

Hi {contactfield=firstname},

ich lese viel über Einkommen, Modelle, Business. Das meiste ist Lärm.

Aber letzten Monat hat mir jemand aus meinem Team etwas gesagt das ich seitdem nicht loswerde:

"Die meisten warten auf den richtigen Moment. Der kommt nicht. Es gibt nur den Moment wo du aufhörst zu warten."

Er hat vor 9 Monaten mit diesem Modell angefangen. Nicht weil alles perfekt war. Weil er aufgehört hat zu warten.

Ich schicke dir das nicht um dich zu pushen. Ich schicke es weil es ehrlich ist.

Falls du irgendwann bereit bist für ein Gespräch: {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV2 — Monat 2
**Typ:** Social Proof / neue Story

### Betreffzeile
`Was Maria letzte Woche gesagt hat, {contactfield=firstname}`

---

### TEXT — EV2

Hi {contactfield=firstname},

Maria hat mir letzte Woche geschrieben. Sie ist seit 13 Monaten dabei.

Ihr erster Satz: "Ich bereue nichts außer dass ich so lange gewartet habe."

Sie kommt aus dem Gesundheitsbereich. Hat zwei Kinder. Hat nie geglaubt dass dieses Modell für jemanden wie sie funktioniert. Heute macht sie nebenbei mehr als ihr damaliger Teilzeitjob eingebracht hat.

Ich teile das nicht als Erfolgsgeschichte für die Broschüre. Ich teile es weil ich weiß dass du noch überlegst — und weil ich glaube dass du ähnliche Gedanken hattest wie Maria damals.

Falls du Fragen hast: antworte einfach.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV3 — Monat 3
**Typ:** Soft Offer / Video-Link wieder anbieten

### Betreffzeile
`Falls du nochmal reinschauen möchtest, {contactfield=firstname}`

---

### TEXT — EV3

Hi {contactfield=firstname},

kurze Nachricht.

Manchmal sitzt jemand die Videos nochmal an und sieht sie mit anderen Augen. Weil sich etwas in der eigenen Situation verändert hat. Weil ein Gespräch stattgefunden hat. Weil irgendetwas im Leben anders geworden ist.

Falls das bei dir der Fall ist — die Videos sind nach wie vor da. Genau dort wo du aufgehört hast.

`[Weiterschauen — {contactfield=ac_last_video_access_url}]`

Und falls du einfach kurz reden möchtest: {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV4 — Monat 4
**Typ:** Personal Story / Coach-Perspektive

### Betreffzeile
`Was mich an meiner Arbeit wirklich antreibt, {contactfield=firstname}`

---

### TEXT — EV4

Hi {contactfield=firstname},

ich werde manchmal gefragt: warum machst du das eigentlich?

Ehrliche Antwort: weil ich weiß wie es ist, keine Optionen zu haben. Vor ein paar Jahren hatte ich einen Job der okay war — aber okay ist kein Leben. Ich wollte mehr. Mehr Zeit, mehr Entscheidungsfreiheit, mehr Sinn.

Dieses Modell hat mir das gegeben. Nicht schnell. Nicht ohne Arbeit.

Wenn ich heute jemandem helfe anzufangen, ist das keine Pflicht. Das ist der einzige Teil meiner Arbeit wo ich wirklich das Gefühl habe dass es zählt.

Du hörst von mir.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV5 — Monat 5
**Typ:** Re-Engagement / "Was neu ist seit damals"

### Betreffzeile
`{contactfield=firstname}, das hat sich seit deinem Quiz verändert`

---

### TEXT — EV5

Hi {contactfield=firstname},

du hast das Quiz vor einigen Monaten ausgefüllt. Seitdem hat sich einiges getan.

Wir haben neue Menschen ins Team bekommen. Neue Ergebnisse. Neue Erfahrungen die ich gerne teilen würde.

Keine Ahnung ob sich deine Situation verändert hat. Vielleicht ist jetzt ein besserer Zeitpunkt als damals. Vielleicht auch nicht.

Falls du neugierig bist was sich getan hat: antworte einfach auf diese Mail. Ich schicke dir eine kurze Zusammenfassung — ohne Pitch, ohne Druck.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

## EVERGREEN EMAIL EV6 — Monat 6
**Typ:** Value/Insight — "Was die meisten falsch verstehen"

### Betreffzeile
`Warum die meisten {contactfield=ac_last_profile_label}s nicht starten — und was sie ändern würden`

---

### TEXT — EV6

Hi {contactfield=firstname},

ich beobachte das seit Jahren. Menschen mit deinem Profil — {contactfield=ac_last_profile_label} — haben oft eine bestimmte Art zu blockieren.

Nicht aus Faulheit. Sondern aus einem Missverständnis.

Sie denken dass sie erst besser sein müssen bevor sie anfangen. Mehr wissen. Mehr vorbereitet. Mehr sicher.

Das ist genau falsch. Man wird besser indem man anfängt. Nicht vorher.

Ich habe das selbst erlebt und ich sehe es bei jedem zweiten Gespräch. Die die warten bis sie "bereit" sind warten meistens noch in zwei Jahren.

Falls das gerade irgendwie aktuell ist für dich: Schreib mir. Nicht um was zu kaufen. Einfach um zu reden.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV7 — Monat 7
**Typ:** Social Proof — Neue Geschichte, passt zum Typ

### Betreffzeile
`Was {contactfield=firstname} K. aus Linz in 8 Monaten aufgebaut hat`

---

### TEXT — EV7

Hi {contactfield=firstname},

ich habe letzte Woche ein Gespräch mit jemandem geführt der mich sehr beeindruckt hat.

Katharina, 39, aus Linz. Zwei Kinder, vollzeit im Büro, kein Vorwissen im Online-Business.

Vor einem Jahr hat sie angefangen. Nicht perfekt vorbereitet. Nicht mit einem ausgereiften Plan. Einfach angefangen.

Heute hat sie ein kleines aber stabiles Nebeneinkommen das ihr erlaubt flexibel zu entscheiden wann sie arbeitet. Kein Millionenbusiness. Aber genug um echte Wahlfreiheit zu haben.

Was ihr geholfen hat: Sie hat aufgehört auf den "richtigen Moment" zu warten und stattdessen auf den nächsten Schritt geschaut. Immer nur den nächsten.

Das klingt simpel. Es ist auch simpel. Nur selten leicht.

Wenn du willst erzähle ich dir mehr über wie Katharina das konkret angegangen ist.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV8 — Monat 8
**Typ:** Soft Offer — "Falls du nochmal reinschauen möchtest"

### Betreffzeile
`Dein Zugang zu den Videos ist noch da`

---

### TEXT — EV8

Hi {contactfield=firstname},

kurze Nachricht heute.

Dein persönlicher Zugang zu den Erklär-Videos ist noch aktiv. Falls du damals nicht alles gesehen hast oder nochmal reinschauen möchtest: Du kannst jederzeit da weitermachen wo du aufgehört hast.

{contactfield=ac_last_video_access_url}

Keine Anmeldung nötig. Der Link bringt dich direkt zu deinem letzten Stand.

Falls du danach Fragen hast oder ein Gespräch möchtest weißt du wo ich bin.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV9 — Monat 9
**Typ:** Personal Story — Coach-Geschichte, andere Lektion als EV4

### Betreffzeile
`Das Jahr wo ich fast aufgehört hätte`

---

### TEXT — EV9

Hi {contactfield=firstname},

ich habe nie viel darüber geredet aber es gab ein Jahr wo ich ernsthaft überlegt habe aufzuhören.

Nicht weil das Business nicht funktioniert hat. Weil ich dachte ich bin nicht der Typ dafür. Zu introvertiert. Zu wenig mitreißend. Zu wenig Charisma.

Ich kenne diesen Moment. Den Vergleich mit anderen die es "leichter" zu haben scheinen.

Was mich damals umgedreht hat war ein einziges Gespräch mit jemandem der schon weiter war als ich. Nicht um mich zu pitchen. Einfach um zuzuhören und dann zu sagen: "Du machst das schon richtig. Hör auf dich mit anderen zu vergleichen."

Seitdem ist das einer meiner Lieblingsmomente wenn ich mit jemandem rede. Dieser Moment wo sie aufhören sich zu vergleichen und anfangen sich selbst zu vertrauen.

Falls du das gerade kennst weißt du wie ich meine.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV10 — Monat 10
**Typ:** Re-Engagement — "Was sich seitdem verändert hat" (Variante 2)

### Betreffzeile
`{contactfield=firstname}, wir haben eine neue Frage die ich dir stellen wollte`

---

### TEXT — EV10

Hi {contactfield=firstname},

ich frage das manchmal Menschen die ich schon länger kenne: Was hat sich in deinem Leben in letzter Zeit verändert?

Nicht nur beruflich. Generell.

Ich frage das weil viele Menschen die damals "nicht bereit" waren es irgendwann sind. Nicht weil das Business einfacher geworden ist. Sondern weil sich ihre Situation verändert hat. Neue Prioritäten. Andere Energie. Ein konkreter Grund der vorher nicht da war.

Wenn du magst kannst du mir einfach antworten. Was hat sich bei dir verändert seit wir zuletzt "gesprochen" haben — via Quiz, meine ich.

Kein Pitch. Nur echtes Interesse.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV11 — Monat 11
**Typ:** Value/Insight — Konkrete Zahl oder Framework

### Betreffzeile
`Diese eine Zahl hat mir alles erklärt`

---

### TEXT — EV11

Hi {contactfield=firstname},

ich habe letztens eine Zahl in einem Gespräch geteilt die für mich damals alles verändert hat.

82 Prozent.

Das ist der Anteil von Menschen die angeben mit ihrer aktuellen beruflichen Situation "eher nicht zufrieden" zu sein. Nicht miserable. Nur nicht zufrieden. Genug um weiterzumachen. Nicht genug um wirklich aufblühen zu können.

Was mich an der Zahl trifft: Die meisten davon wissen das sie mehr wollen. Sie wissen nur nicht wie sie von A nach B kommen ohne alles zu riskieren.

Genau das ist der Punkt warum ich tue was ich tue. Nicht um die Welt zu retten. Um den konkreten Weg von A nach B zu zeigen für die Menschen die wissen dass sie mehr können.

Falls du zu den 82 Prozent gehörst: Du bist nicht allein. Und es gibt einen Weg.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

## EVERGREEN EMAIL EV12 — Monat 12
**Typ:** Social Proof — Jahres-Rückblick Charakter

### Betreffzeile
`Ein Jahr. Was in diesem Jahr möglich war.`

---

### TEXT — EV12

Hi {contactfield=firstname},

ich mache das jetzt seit einigen Jahren und jedes Mal wenn ich an einem Jahresende zurückschaue denke ich dasselbe.

Die Menschen die ein Jahr weiter sind als damals sind fast nie die die am meisten Talent hatten. Sie sind die die angefangen haben. Und dann weitergemacht haben auch wenn es unbequem war.

Letztes Jahr haben mehrere Menschen aus unserem Netzwerk ihren ersten zahlenden Kunden gemacht. Einer hat seinen Job gekündigt. Zwei haben ihr Nebeneinkommen auf Haupteinkommen-Niveau gebracht. Einer arbeitet jetzt von Spanien aus.

Das sind keine Ausnahmen. Das ist was passiert wenn man einen klaren Weg hat und ihn geht.

Du hast vor einem Jahr das Quiz gemacht. Ein Jahr ist vergangen. Ich weiß nicht was bei dir passiert ist in dieser Zeit.

Aber falls du weißt dass du bereit bist — wirklich bereit — ist jetzt ein guter Zeitpunkt für ein Gespräch.

{contactfield=ac_berater_vorname}

---

*Du erhältst diese Mail weil du dich auf business.activecenter.info eingetragen hast. [{unsubscribe_url} Abmelden] · [Impressum & Datenschutz]*

---

---

*Ende Dokument — Version 1.1 — DE*  
*Evergreen-Bibliothek: EV1–EV12 vollständig (12 Monate)*  
*Nächste Schritte: Review + Justierung → IT + EN Übersetzung → Mautic-Templates bauen*
