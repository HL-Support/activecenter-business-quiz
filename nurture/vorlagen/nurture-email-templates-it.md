# Nurture Email Templates — Italiano (Master)

**Versione:** 1.0
**Lingua:** IT
**Sistema:** Mautic (personalizzazione via `{contactfield=...}`)
**Humanizer:** Creato secondo le regole anti-ai-slop-humanizer

**Token Mautic:**
- `{contactfield=firstname}` — Nome del lead
- `{contactfield=ac_last_profile_label}` — Etichetta tipo (es. "Il realizzatore")
- `{contactfield=ac_last_main_goal_label}` — Etichetta aspirazione
- `{contactfield=ac_last_barrier}` — Codice barriera (vehicle/community/confidence/opportunity)
- `{contactfield=ac_last_video_access_url}` — Link di ripresa (permanente)
- `{contactfield=ac_berater_vorname}` — Nome coach
- `{contactfield=ac_berater_name}` — Cognome coach
- `{contactfield=ac_berater_whatsapp}` — WhatsApp coach
- `{contactfield=ac_berater_email}` — Email coach
- `{unsubscribe_url}` — Cancellazione iscrizione Mautic

**Codici profilo:**
- R = Fuoco = "Il realizzatore"
- Y = Vento = "Il connettore"
- G = Acqua = "L'ancora"
- B = Roccia = "L'architetto"

**Codici barriera:**
- vehicle = nessun sistema, nessun punto di partenza
- community = nessun ambiente adatto
- confidence = dubbi interiori, mancanza di sicurezza
- opportunity = non vede ancora l'opportunità

---

## EMAIL A2 — Giorno 2 dopo la registrazione (State 0)
**Formato:** Story-Email (~350 parole)
**Trigger:** 2 giorni dopo `form_submitted_at`, quando `lifecycle_stage = registered`

### Oggetto (specifico per aspirazione)
- **libertà:** `Cosa significa libertà per qualcuno con il tuo profilo, {contactfield=firstname}`
- **impatto:** `{contactfield=firstname}, come cambiare davvero qualcosa — lo mostra il Video 1`
- **sicurezza:** `Costruire una base solida senza stravolgere tutto, {contactfield=firstname}`
- **crescita:** `{contactfield=firstname}, perché la crescita per te ha un aspetto diverso`

---

### VERSIONE LIBERTÀ — A2

Ciao {contactfield=firstname},

due anni fa Stefan, responsabile vendite di Monaco, aveva lo stesso pensiero ogni lunedì mattina.

Non ancora.

Il lavoro non lo odiava nemmeno. Voleva solo delle opzioni. Qualcosa che valesse qualcosa anche quando non era lui a farlo girare. Oggi pianifica il suo lunedì da solo. Nessun capo, nessun posto fisso, nessuna struttura che gli va bene ma non gli appartiene.

Cosa ha fatto? Si è costruito una seconda entrata. Partendo dallo stesso punto da cui parti tu.

Il tuo codice di successo mostra che sai quello che vuoi e che non aspetti il permesso di nessuno. Esattamente questo tipo costruisce in fretta quando il modello funziona per lui. Il Video 1 ti mostra la meccanica. 8 minuti. Poi sai tu stesso se fa al caso tuo o no.

*[CTA TIPO-SPECIFICO — Mautic Dynamic Content secondo ac_last_profile]*

**Fuoco:** `[Guardalo ora — 8 minuti bastano]`

**Vento:** `[Dai un'occhiata — lascia che l'immagine ti dica qualcosa]`

**Acqua:** `[Guarda cosa ti aspetta — senza fretta, senza scadenze]`

**Roccia:** `[Capire la struttura — guarda il Video 1]`

---

{contactfield=ac_berater_vorname}

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE IMPATTO — A2

Ciao {contactfield=firstname},

Lisa era insegnante. 14 anni. Le piaceva quello che faceva. Ma aveva la sensazione che il suo impatto finisse alla porta della scuola.

Oggi lavora con persone in 4 paesi. Non perché ha ribaltato tutto. Perché ha trovato un modo per tradurre quello che faceva già — portare le persone avanti davvero — in qualcosa con una portata più ampia.

Il tuo profilo mostra lo stesso schema: qualcuno che non pensa solo a sé. Il momento in cui guardi il Video 1 capirai perché il tuo tipo in questo modello ha un impatto diverso dalla maggior parte.

Niente lustrini. Niente promesse. Solo quello che è realmente.

*[CTA TIPO-SPECIFICO secondo ac_last_profile]*

**Fuoco:** `[8 minuti. Poi decidi tu.]`

**Vento:** `[Guarda e senti se fa per te]`

**Acqua:** `[Ti spiego prima cosa ti aspetta — poi decidi]`

**Roccia:** `[Come funziona davvero il modello — Video 1]`

---

{contactfield=ac_berater_vorname}

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE SICUREZZA — A2

Ciao {contactfield=firstname},

Marco aveva un buon lavoro. Famiglia, casa, spese fisse. Non voleva rischiare niente — voleva costruire una seconda entrata solida mentre continuava come prima.

Oggi ha entrambe le cose.

Non ha lasciato il lavoro. Non ha stravoltato niente. Ha costruito qualcosa accanto alla sua vita quotidiana che ormai rende più del suo vecchio secondo lavoro. La differenza: aveva un modello che funzionava per il suo tipo.

Il tuo codice di successo mostra che pensi allo stesso modo. Solido, a lungo termine, niente lasciato al caso. Il Video 1 ti mostra come appare concretamente — niente hype, solo struttura.

*[CTA TIPO-SPECIFICO secondo ac_last_profile]*

**Fuoco:** `[Diretto al sodo — vuoi fatti, non promesse]`

**Vento:** `[Lascia che il video ti dica qualcosa — 8 minuti]`

**Acqua:** `[Ecco cosa trovi nel Video 1. Nessuna pressione, nessun pitch.]`

**Roccia:** `[Capire il modello per intero — guarda il Video 1]`

---

{contactfield=ac_berater_vorname}

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE CRESCITA — A2

Ciao {contactfield=firstname},

David nel suo lavoro aveva ottenuto tutto quello che voleva. Promozione, stipendio, titolo. Eppure aveva la sensazione di stare sul posto.

Il problema non era il lavoro. Era l'ambiente. Era il più sveglio della stanza.

Da quando ha costruito questo modello è diverso. È circondato da persone che lo sfidano. Imprenditori, coach, persone che stanno davvero costruendo qualcosa. Il suo reddito è cresciuto. Ma ancora di più: è cresciuto lui.

Il tuo profilo mostra lo stesso schema: non ti fermi mai. Nessun plateau ti trattiene a lungo. Il Video 1 ti mostra quale ambiente e quale modello si adatta a qualcuno con la tua energia.

*[CTA TIPO-SPECIFICO secondo ac_last_profile]*

**Fuoco:** `[Cosa c'è dentro — 8 minuti, poi decidi]`

**Vento:** `[L'ambiente che c'è dietro — guarda chi c'è]`

**Acqua:** `[Spiegato passo per passo — Video 1]`

**Roccia:** `[Il framework dietro tutto — guarda il Video 1]`

---

{contactfield=ac_berater_vorname}

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL A3 — Giorno 5 dopo la registrazione (State 0)
**Formato:** Email di empatia (~280 parole)
**Trigger:** 5 giorni dopo `form_submitted_at`, se nessun video guardato

### Oggetto (universale)
`So cosa ti frena, {contactfield=firstname}`

---

### VERSIONE VEHICLE (nessun sistema, nessun punto di partenza) — A3

Ciao {contactfield=firstname},

sai cosa dice la maggior parte delle persone quando chiedo perché non hanno ancora iniziato?

"Non so come fare."

Non: non voglio. Non: non mi interessa. Semplicemente: non vedo un primo passo chiaro.

È umano. Ed è esattamente quello che il Video 1 risolve.

Il video non è un discorso motivazionale. Ti mostra come è costruito il modello. Qual è il primo passo. Cosa è realisticamente possibile e in quanto tempo.

Dopo puoi giudicare tu stesso se fa per te. Non io.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE COMMUNITY (nessun ambiente adatto) — A3

Ciao {contactfield=firstname},

sai cosa mi disturba della maggior parte delle "opportunità di business"?

Le affronti da solo. Nessun supporto, nessun team, nessuno che capisce cosa stai costruendo.

È di gran lunga il motivo più comune per cui le persone valide mollano. Non perché il modello non funzioni. Perché erano sole.

Cosa è diverso qui — lo mostra il Video 1. Non come argomento di vendita. Semplicemente perché risponde alla domanda: chi c'è quando diventa difficile?

Guardalo. 8 minuti.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE CONFIDENCE (dubbi interiori) — A3

Ciao {contactfield=firstname},

"Sono davvero il tipo adatto?"

Questa domanda la sento più spesso di qualsiasi altra. Da persone intelligenti, capaci, che hanno esattamente quello che serve.

Il dubbio non è un segno di debolezza. Di solito è un segno che qualcosa ti sta a cuore.

Non ti dico che ce la farai. Sarebbe vuoto. Ti mostro nel Video 1 cosa hanno costruito le persone con il tuo profilo — così puoi giudicare tu stesso se sembra realistico. Non io.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE OPPORTUNITY (opportunità non ancora chiara) — A3

Ciao {contactfield=firstname},

a volte il problema non è la decisione. Il problema è non aver ancora capito davvero cosa viene offerto.

È legittimo. Spiego male quando ho poco tempo.

Il Video 1 lo fa meglio di quanto potrei farlo in una email. Ti mostra in concreto: cos'è il modello, chi lo fa, cosa porta realisticamente. Niente presentazione da 45 minuti. 8 minuti, dritto al punto.

Se dopo dici "non fa per me" — va benissimo. Almeno lo sai.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL A4 — Giorno 10 dopo la registrazione (State 0)
**Formato:** Testimonial-Email (~300 parole)
**Trigger:** 10 giorni dopo `form_submitted_at`, se nessun video
**Nota:** Abbinamento per tipo nella storia consigliato — Mautic Dynamic Content secondo `ac_last_profile`

### Oggetto (specifico per tipo)
- **Fuoco:** `Cosa hanno in comune {contactfield=firstname} e Thomas`
- **Vento:** `Come ha iniziato Claudia — e perché si adatta a te, {contactfield=firstname}`
- **Acqua:** `{contactfield=firstname}, ecco qualcuno che pensava esattamente come te`
- **Roccia:** `Cosa ha fatto Michael dopo 6 mesi di analisi, {contactfield=firstname}`

---

### VERSIONE FUOCO — A4

Ciao {contactfield=firstname},

Thomas era responsabile vendite. 47 anni, bravo nel lavoro, nessun tempo per esperimenti. Ha fatto il quiz, ha aspettato due settimane, poi ha guardato il video. Per curiosità.

Oggi sta costruendo un team in parallelo. Non perché ha ribaltato tutto. Perché il modello è strutturato esattamente come funziona la sua testa: obiettivi chiari, struttura chiara, niente giri inutili.

In 14 mesi ha guadagnato più che nel suo primo anno nel vecchio lavoro. Non lo abbellisco — te lo direbbe lui stesso.

Cosa aveva lui che hai anche tu? Lo stesso tipo. La stessa spinta. La stessa fame.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — adesso — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE VENTO — A4

Ciao {contactfield=firstname},

Claudia viene dall'organizzazione eventi. Ama le persone, ama l'energia, ama quando le cose accadono. Il problema: il suo lavoro la pretendeva 24 ore su 24.

Voleva qualcosa che crescesse con lei — non qualcosa che la esaurisse.

Oggi fa esattamente quello che ha sempre fatto: mettere insieme le persone, entusiasmarle, aprire porte. Ma alle sue condizioni. In 8 mesi ha costruito un piccolo team che va avanti anche quando lei è in vacanza.

Il suo codice di successo sembrava esattamente come il tuo.

{contactfield=ac_berater_vorname}

`[Dai un'occhiata — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE ACQUA — A4

Ciao {contactfield=firstname},

Sandra è infermiera. Una persona che aiuta nel profondo. Dubita di quasi tutto — soprattutto di se stessa. Dopo aver fatto il quiz ha aspettato 3 settimane senza fare nulla.

Poi ha iniziato.

Non perché all'improvviso era coraggiosa. Perché il suo coach le aveva detto: oggi non devi decidere niente. Guarda solo il video.

Oggi ha un reddito extra che dà alla sua famiglia più margine. Nessuna pressione, nessun hype. Semplicemente qualcosa che funziona, se lo lasci andare.

{contactfield=ac_berater_vorname}

`[Guarda il Video 1 — {contactfield=ac_last_video_access_url}]`

*Nessuna pressione. Guardi, poi giudichi da solo.*

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE ROCCIA — A4

Ciao {contactfield=firstname},

Michael è ingegnere. Ha analizzato per 6 mesi prima di iniziare. Fogli di calcolo, domande, confronti con altri modelli.

Poi ha iniziato.

Non perché ha smesso di analizzare — ma perché aveva abbastanza dati per prendere una decisione. In 18 mesi ha capito il modello così bene da averlo ottimizzato in un modo che ha impressionato persino il mio coach.

Quello che mi ha colpito di lui: non che fosse veloce. Che fosse approfondito. Ed è esattamente quello che manca a tanti.

{contactfield=ac_berater_vorname}

`[Video 1 — Capire le basi — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL A5 — Giorno 21 dopo la registrazione (State 0)
**Formato:** Check-in personale (~150 parole)
**Trigger:** 21 giorni dopo `form_submitted_at`, se nessun video
**Dopo:** Transizione alla fase evergreen

### Oggetto
`Una domanda veloce, {contactfield=firstname}`

---

### TESTO — A5 (universale, nessuna pressione)

Ciao {contactfield=firstname},

volevo farti un check-in veloce.

Hai fatto il quiz, hai visto il risultato — e da allora non hai fatto nulla. Va benissimo. Non sono preoccupato.

Mi interessa solo sapere: c'è qualcosa che non è chiaro? Qualcosa che ti trattiene?

Se sì, rispondi semplicemente a questa email. Nessuna trattativa, nessun copione. La leggo io stesso e rispondo.

Se semplicemente non è il momento giusto — va bene anche così. Ti scrivo quando ho qualcosa di concreto.

{contactfield=ac_berater_vorname}

`[Se vuoi: il Video 1 è qui — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL B1 — 24h dopo il Video 1 (State 1, nessun V2)
**Formato:** Ibrido corto+storia (~250 parole)
**Trigger:** 24h di inattività dopo `video_1_watched_at`, se `video_2_watched_at` vuoto

### Oggetto (specifico per tipo)
- **Fuoco:** `Quello che hai visto nel Video 1 è solo l'inizio, {contactfield=firstname}`
- **Vento:** `{contactfield=firstname} — il Video 2 ti mostra le persone dietro tutto`
- **Acqua:** `Il passo successivo è più semplice di quanto pensi, {contactfield=firstname}`
- **Roccia:** `{contactfield=firstname}, il Video 2 spiega la meccanica che il Video 1 aveva solo accennato`

---

### VERSIONE FUOCO — B1

Ciao {contactfield=firstname},

il Video 1 ti ha mostrato cos'è il modello.

Il Video 2 ti mostra come scala. È la differenza tra un buon secondo lavoro e una vera seconda entrata.

Le persone con il tuo profilo costruiscono questo più in fretta di quanto pensino — perché non esitano quando il sistema è chiaro. Il Video 2 lo rende chiaro.

12 minuti.

{contactfield=ac_berater_vorname}

`[Guarda il Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE VENTO — B1

Ciao {contactfield=firstname},

sai qual è la cosa speciale di questo modello per qualcuno come te?

Funziona attraverso le persone. Non nonostante — proprio per questo.

Il Video 2 ti mostra come altri connettori hanno costruito questo modello. Facce vere, storie vere. Niente lavagna, niente presentazione di numeri. Solo persone che raccontano cosa hanno fatto.

{contactfield=ac_berater_vorname}

`[Guarda il Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE ACQUA — B1

Ciao {contactfield=firstname},

hai visto il Video 1. Bene.

Il Video 2 va un livello più in profondità — non più veloce, non più rumoroso. Ti mostra come appare il modello nella vita quotidiana. Cosa porta il secondo mese, cosa significa realisticamente il primo anno.

Nessuna pressione. Guardalo quando hai un momento tranquillo.

{contactfield=ac_berater_vorname}

`[Guarda il Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE ROCCIA — B1

Ciao {contactfield=firstname},

il Video 1 ha mostrato la superficie.

Il Video 2 spiega la struttura dietro: come è costruito il modello di reddito, come funziona la scalabilità, perché il modello gira anche senza attività costante. Sono le domande che fa chiunque guardi davvero — e le risposte sono migliori di quanto probabilmente ti aspetti.

{contactfield=ac_berater_vorname}

`[Guarda il Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EMAIL B2 — B+3 giorni (State 1, nessun V2)
**Formato:** Framework-Insight (~300 parole)
**Trigger:** 3 giorni dopo B1, se ancora nessun V2

### Oggetto (specifico per tipo)
- **Fuoco:** `Perché i realizzatori scalano più in fretta degli altri con questo modello`
- **Vento:** `{contactfield=firstname}, il vantaggio che i connettori hanno fin dall'inizio`
- **Acqua:** `Perché sono le persone tranquille e affidabili ad arrivare più lontano`
- **Roccia:** `{contactfield=firstname}, il principio sistemico dietro questo modello`

---

### TESTO — B2 (4 varianti per tipo)

**FUOCO:**

Ciao {contactfield=firstname},

c'è un motivo per cui le persone con il tuo profilo avanzano più in fretta della media in questo modello.

Non analizzano troppo a lungo. Iniziano, correggono, costruiscono.

Il modello è fatto per questo: passi chiari, obiettivi chiari, niente attesa della perfezione. Chi inizia ha un vantaggio su chiunque stia ancora valutando. Il Video 2 ti mostra la struttura — così puoi giudicare tu stesso se il tuo ritmo funziona qui.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**VENTO:**

Ciao {contactfield=firstname},

il vantaggio più grande che i connettori hanno in questo modello viene raramente detto ad alta voce.

Non devono fare acquisizione a freddo. Condividono semplicemente quello che hanno vissuto — e chi è curioso si fa vivo. È la differenza tra vendere e invitare. Tu hai questo talento. Il Video 2 ti mostra come altri connettori lo hanno messo in pratica concretamente.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**ACQUA:**

Ciao {contactfield=firstname},

sai chi costruisce in modo più costante in questo modello?

Non i più rumorosi. I più affidabili.

Persone che semplicemente vanno avanti, mese dopo mese. Nessun risultato miracoloso nella settimana tre — ma dopo 12 mesi un reddito stabile che regge. Esattamente questo è il tuo vantaggio. Il Video 2 ti mostra il piano di costruzione dietro.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**ROCCIA:**

Ciao {contactfield=firstname},

ecco il principio sistemico che la maggior parte non vede:

Il modello ha due fonti di reddito. Una funziona senza team, una cresce grazie al team. Entrambe girano in parallelo. Non è un caso — è il motivo per cui scala senza che tu debba essere attivo ogni giorno.

Il Video 2 lo spiega per intero. Senza semplificazioni.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL C1 — 24h dopo il Video 2 (State 2, nessun V3)
**Formato:** Testimonial-Email (~280 parole)
**Trigger:** 24h di inattività dopo `video_2_watched_at`, se `video_3_watched_at` vuoto

### Oggetto
`{contactfield=firstname}, il Video 3 è il più personale di tutti`

---

### TESTO — C1 (universale + citazione tipo-specifica)

Ciao {contactfield=firstname},

hai visto come è costruito il modello. Adesso arriva il Video 3.

Non è un video di strategia. Non è un blocco di numeri. Sono persone che raccontano cosa hanno vissuto — prima di iniziare, e cosa è successo dopo.

*[Mautic Dynamic Content secondo ac_last_profile — una citazione diversa per tipo]*

**Fuoco:**
> "Ho aspettato 3 mesi perché pensavo di dover sapere ancora di più. È stato un errore. Le decisioni migliori le ho prese quando ho semplicemente iniziato."
> — Thomas, responsabile vendite, 14 mesi nel modello

**Vento:**
> "Quello che mi ha convinto non era il numero sul conto. Era la conversazione con qualcuno che funziona come me — che mi ha detto semplicemente: funziona, te lo mostro."
> — Claudia, organizzatrice di eventi, 8 mesi nel modello

**Acqua:**
> "Non credevo di farcela. Il mio coach non mi ha convinta. Mi ha dato tempo. È stata questa la differenza."
> — Sandra, infermiera, 11 mesi nel modello

**Roccia:**
> "Ho verificato tutto prima di iniziare. Tutto tornava. Quello che non mi aspettavo: che dopo un anno avrei ottimizzato il modello io stesso."
> — Michael, ingegnere, 18 mesi nel modello

Il Video 3 ha molto di più. Persone vere, situazioni vere.

{contactfield=ac_berater_vorname}

`[Guarda il Video 3 — {contactfield=ac_last_video_access_url}]`

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EMAIL C2 — C+3 giorni (State 2, nessun V3)
**Formato:** Multi-Proof (~300 parole)

### Oggetto (specifico per tipo)
- **Fuoco:** `Due esempi che mostrano cosa è possibile con il tuo profilo`
- **Vento:** `{contactfield=firstname}, tre persone che hanno iniziato esattamente come te`
- **Acqua:** `{contactfield=firstname} — cosa succede quando inizi semplicemente`
- **Roccia:** `Risultati reali: 6 mesi, 12 mesi, 18 mesi a confronto`

---

### TESTO — C2 (selezione proof per tipo)

**FUOCO:**

Ciao {contactfield=firstname},

due numeri dall'ultimo anno:

Annette, 39, team leader: dopo 6 mesi 1.400 € di reddito extra, dopo 14 mesi sostituisce completamente il suo vecchio secondo lavoro.

Rafael, 44, lavoratore autonomo: 9 mesi fino a smettere di dubitare, 3 mesi dopo era in profitto.

Entrambi avevano il tuo tipo. Nessuno dei due ha aspettato il momento perfetto. Il Video 3 ti spiega perché.

`[Guarda il Video 3 — {contactfield=ac_last_video_access_url}]`

---

**VENTO:**

Ciao {contactfield=firstname},

sai cosa hanno in comune le persone del mio team che sono arrivate più lontano?

Non hanno iniziato da soli. Avevano qualcuno che mostrava loro come fare.

Julia in 7 mesi ha costruito un team di 12 persone. Non perché è particolarmente talentuosa — ma perché entusiasma le persone. Come fai tu.

Il Video 3 ti mostra la sua storia e quella di altri due che hanno iniziato allo stesso modo.

`[Guarda il Video 3 — {contactfield=ac_last_video_access_url}]`

---

**ACQUA:**

Ciao {contactfield=firstname},

non ti mando promesse.

Solo questo: Bernd, 52 anni, insegnante. Ha impiegato 10 mesi prima di iniziare. Poi ha costruito, lentamente, in modo affidabile. Dopo 2 anni il suo reddito extra è più stabile di quanto oscilla il suo stipendio.

Ha detto: l'unica cosa che rimpiango è non aver guardato il video prima.

`[Guarda il Video 3 — {contactfield=ac_last_video_access_url}]`

---

**ROCCIA:**

Ciao {contactfield=firstname},

ecco andamenti di reddito reali dalla mia rete, anonimizzati:

Profilo Tipo B, mese di inizio gennaio: Mese 6: €890 | Mese 12: €2.100 | Mese 18: €3.400

Non è un caso eccezionale. È lo schema quando qualcuno lavora con la tua sistematicità.

Il Video 3 spiega la costruzione dietro. Senza abbellimenti.

`[Guarda il Video 3 — {contactfield=ac_last_video_access_url}]`

---

*{contactfield=ac_berater_vorname}*

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL D1 — 24h dopo il Video 3 (State 3, nessun CTA)
**Formato:** Email di decisione diretta (~280 parole)
**Trigger:** 24h dopo `video_3_watched_at`, se nessun CTA

### Oggetto (specifico per aspirazione)
- **libertà:** `{contactfield=firstname}, hai visto tutti i video — cosa ti trattiene adesso?`
- **impatto:** `{contactfield=firstname}, e se iniziassi domani?`
- **sicurezza:** `Hai tutte le informazioni, {contactfield=firstname}. Cosa manca ancora?`
- **crescita:** `{contactfield=firstname} — il passo successivo è una conversazione, niente di più`

---

### TESTO — D1 (universale, hook aspirazione all'inizio)

Ciao {contactfield=firstname},

hai guardato tutti e tre i video. Sai come funziona il modello, cosa porta realisticamente, chi ha iniziato con esso.

*[Hook aspirazione — Mautic Dynamic Content]*

**libertà:** Adesso la domanda è semplice: vuoi continuare con lo stesso ritmo, o vuoi iniziare a costruire delle opzioni?

**impatto:** Hai visto cosa è possibile. Per le persone che vogliono aiutare gli altri, c'è abbastanza spazio qui.

**sicurezza:** Hai tutti i fatti. Il rischio è contenuto — lo hanno mostrato i video.

**crescita:** Hai visto cosa hanno costruito le persone con la tua energia. La domanda è quando, non se.

---

Il passo successivo è una conversazione. Nessun pitch, nessuna pressione. Solo un giro aperto con {contactfield=ac_berater_vorname} — 20 o 30 minuti.

Scrivi direttamente:

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oppure rispondi a questa email.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL D2 — D+3 giorni (State 3, nessun CTA)
**Formato:** Email obiezioni (~350 parole)
**Trigger:** 3 giorni dopo D1, se nessun CTA

### Oggetto (specifico per barriera)
- **vehicle:** `"Non so da dove iniziare" — questa conversazione risponde`
- **community:** `{contactfield=firstname}, non devi capirlo da solo`
- **confidence:** `{contactfield=firstname}, il dubbio è legittimo. Ecco la mia risposta onesta.`
- **opportunity:** `Cosa porta davvero il modello — nessuna versione patinata, {contactfield=firstname}`

---

### VERSIONE VEHICLE — D2

Ciao {contactfield=firstname},

"Da dove inizio?" è la domanda più frequente che ricevo da persone che hanno visto tutti i video e non arrivano al passo successivo.

Non è un segno di debolezza. È il momento in cui una conversazione vale più di un altro video.

In 20 minuti ti rispondo a:
- Qual è il tuo primo passo realistico
- Cosa ti costa davvero all'inizio (tempo, denaro)
- Cosa succede nel mese 1, 2, 3

Dopo hai chiarezza — qualunque sia la tua decisione.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oppure rispondi a questa email.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE COMMUNITY — D2

Ciao {contactfield=firstname},

questo non vuole essere una lezione. Solo una domanda onesta:

C'è qualcuno nel tuo giro che lo fa già, che può dirti com'è davvero?

Se no — è quello il problema. Non il modello.

Sono qui per questo. Non come coach che ti vende qualcosa. Come persona che sa cosa significa stare davanti a una decisione che nessuno intorno a te capisce.

20 minuti. Aperto. Onesto.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE CONFIDENCE — D2

Ciao {contactfield=firstname},

non ti dirò che ce la farai. Sarebbe poco serio.

Quello che posso dirti: le persone che ho incontrato con il dubbio più grande erano spesso quelle che sono andate più lontano. Perché il dubbio significa che prendi sul serio quello che fai.

La conversazione che ti offro non è una seduta motivazionale. È una conversazione onesta su cosa ti trattiene — e se è davvero un motivo o una reazione di difesa.

Decidi tu dopo.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` oppure rispondi qui.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

### VERSIONE OPPORTUNITY — D2

Ciao {contactfield=firstname},

forse hai guardato i video e hai pensato: sembra interessante — ma cosa porta davvero?

È la domanda più onesta che si possa fare.

Non rispondo con numeri che vado a cercare. Rispondo con quello che ho visto nella mia rete: cosa hanno costruito le persone in 6 mesi, cosa hanno investito, cosa non ha funzionato.

Tutto questo — senza abbellimenti — in 20 minuti.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL D3 — D+7 giorni (State 3, nessun CTA)
**Formato:** Breve + invito autentico (~130 parole)
**Trigger:** 7 giorni dopo D1, se nessun CTA
**Dopo:** Inizia la fase evergreen

### Oggetto
`Ultimo messaggio da me per un po', {contactfield=firstname}`

---

### TESTO — D3

Ciao {contactfield=firstname},

non ti scriverò più ogni settimana.

Non perché non mi interessi. Ma perché sai già tutto quello che devi sapere. Più informazioni non aiutano.

Quando sei pronto, sono qui. Scrivi quando vuoi — nessun processo, nessuna attesa.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

Ti scrivo di nuovo quando ho qualcosa che è davvero rilevante per te.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EMAIL E1 — Post-CTA (immediatamente dopo il clic CTA)
**Formato:** Warm Welcome (~200 parole)

### Oggetto
`{contactfield=firstname}, la tua richiesta è arrivata`

---

### TESTO — E1

Ciao {contactfield=firstname},

ho ricevuto il tuo messaggio.

Bene che ti sia fatto sentire.

Mi faccio vivo nelle prossime 24 ore — via WhatsApp o email, a seconda di come hai scritto. Nessun copione, nessuna trattativa. Solo un giro aperto in cui vediamo se e come questo fa per te.

Se vuoi, porta pure la tua domanda più importante. La cosa che ancora non capisci o non riesci a vedere chiaramente.

Non vedo l'ora di parlare.

{contactfield=ac_berater_vorname}
{contactfield=ac_berater_email}
WhatsApp: {contactfield=ac_berater_whatsapp}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EVERGREEN EMAIL EV1 — Mese 1
**Tipo:** Valore/Insight
**Trigger:** Primo mese dopo la fine della fase di attivazione

### Oggetto
`{contactfield=firstname}, un pensiero che non riesco a togliermi dalla testa`

---

### TESTO — EV1

Ciao {contactfield=firstname},

leggo molto su reddito, modelli, business. La maggior parte è rumore.

Ma il mese scorso qualcuno del mio team mi ha detto una cosa da cui non riesco a staccarmi:

"La maggior parte aspetta il momento giusto. Non arriva mai. Esiste solo il momento in cui smetti di aspettare."

Ha iniziato con questo modello 9 mesi fa. Non perché tutto era perfetto. Perché ha smesso di aspettare.

Non ti mando questo per spingerti. Te lo mando perché è onesto.

Se mai fossi pronto per una conversazione: {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV2 — Mese 2
**Tipo:** Social Proof / nuova storia

### Oggetto
`Cosa mi ha scritto Maria la settimana scorsa, {contactfield=firstname}`

---

### TESTO — EV2

Ciao {contactfield=firstname},

Maria mi ha scritto la settimana scorsa. È con noi da 13 mesi.

Prima frase: "Non rimpiango nulla tranne di aver aspettato così tanto."

Viene dal settore sanitario. Ha due figli. Non aveva mai creduto che questo modello potesse funzionare per qualcuno come lei. Oggi guadagna extra più di quello che le dava il suo vecchio part-time.

Non lo condivido come storia di successo per la brochure. Lo condivido perché so che stai ancora valutando — e perché credo che tu abbia avuto pensieri simili a quelli che aveva Maria allora.

Se hai domande: rispondi semplicemente.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV3 — Mese 3
**Tipo:** Offerta soft / riproposizione link video

### Oggetto
`Se vuoi dare un'altra occhiata, {contactfield=firstname}`

---

### TESTO — EV3

Ciao {contactfield=firstname},

messaggio breve.

A volte qualcuno rivede i video e li guarda con occhi diversi. Perché qualcosa nella propria situazione è cambiato. Perché è avvenuta una conversazione. Perché qualcosa nella vita è diventato diverso.

Se è così nel tuo caso — i video sono ancora lì. Esattamente dove ti eri fermato.

`[Continua a guardare — {contactfield=ac_last_video_access_url}]`

E se vuoi semplicemente parlare un po': {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV4 — Mese 4
**Tipo:** Storia personale / prospettiva coach

### Oggetto
`Cosa mi motiva davvero nel mio lavoro, {contactfield=firstname}`

---

### TESTO — EV4

Ciao {contactfield=firstname},

ogni tanto mi viene chiesto: ma perché lo fai?

Risposta onesta: perché so cosa significa non avere opzioni. Qualche anno fa avevo un lavoro che andava bene — ma "va bene" non è una vita. Volevo di più. Più tempo, più libertà di scelta, più senso.

Questo modello me l'ha dato. Non in fretta. Non senza lavoro.

Quando oggi aiuto qualcuno a iniziare, non è un obbligo. È l'unica parte del mio lavoro in cui sento davvero che conta qualcosa.

Ti scrivo.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV5 — Mese 5
**Tipo:** Re-engagement / "Cosa è cambiato da allora"

### Oggetto
`{contactfield=firstname}, questo è cambiato da quando hai fatto il quiz`

---

### TESTO — EV5

Ciao {contactfield=firstname},

hai fatto il quiz qualche mese fa. Da allora sono successe alcune cose.

Abbiamo nuove persone nel team. Nuovi risultati. Nuove esperienze che mi piacerebbe condividere.

Non so se la tua situazione è cambiata. Forse adesso è un momento migliore di allora. Forse no.

Se sei curioso di sapere cosa è successo: rispondi semplicemente a questa email. Ti mando un breve riassunto — senza pitch, senza pressione.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

## EVERGREEN EMAIL EV6 — Mese 6
**Tipo:** Valore/Insight — "Cosa fraintende la maggior parte"

### Oggetto
`Perché la maggior parte dei {contactfield=ac_last_profile_label} non inizia — e cosa cambierebbe`

---

### TESTO — EV6

Ciao {contactfield=firstname},

lo osservo da anni. Le persone con il tuo profilo — {contactfield=ac_last_profile_label} — hanno spesso un modo specifico di bloccarsi.

Non per pigrizia. Per un malinteso.

Pensano di dover essere migliori prima di iniziare. Sapere di più. Essere più preparati. Più sicuri.

È esattamente sbagliato. Si migliora iniziando. Non prima.

L'ho vissuto io stesso e lo vedo in ogni seconda conversazione. Quelli che aspettano di essere "pronti" di solito aspettano ancora tra due anni.

Se questo è in qualche modo attuale per te: scrivimi. Non per comprare niente. Solo per parlare.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV7 — Mese 7
**Tipo:** Social Proof — Nuova storia, si adatta al tipo

### Oggetto
`Cosa ha costruito {contactfield=firstname} K. di Linz in 8 mesi`

---

### TESTO — EV7

Ciao {contactfield=firstname},

la settimana scorsa ho avuto una conversazione con qualcuno che mi ha molto colpito.

Katharina, 39 anni, di Linz. Due figli, a tempo pieno in ufficio, nessuna esperienza nell'online business.

Un anno fa ha iniziato. Non perfettamente preparata. Non con un piano elaborato. Ha semplicemente iniziato.

Oggi ha un reddito extra piccolo ma stabile che le permette di decidere liberamente quando lavora. Nessun milione in banca. Ma abbastanza per avere una vera libertà di scelta.

Cosa l'ha aiutata: ha smesso di aspettare il "momento giusto" e ha guardato al passo successivo. Solo sempre il prossimo.

Sembra semplice. Lo è anche. Solo raramente facile.

Se vuoi ti racconto di più su come Katharina ha affrontato le cose concretamente.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV8 — Mese 8
**Tipo:** Offerta soft — "Se vuoi dare un'altra occhiata"

### Oggetto
`Il tuo accesso ai video è ancora attivo`

---

### TESTO — EV8

Ciao {contactfield=firstname},

messaggio breve oggi.

Il tuo accesso personale ai video esplicativi è ancora attivo. Se allora non hai visto tutto o vuoi dare un'altra occhiata: puoi riprendere in qualsiasi momento da dove ti eri fermato.

{contactfield=ac_last_video_access_url}

Nessun login necessario. Il link ti porta direttamente al tuo ultimo punto.

Se dopo hai domande o vuoi una conversazione, sai dove trovarmi.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV9 — Mese 9
**Tipo:** Storia personale — Storia del coach, lezione diversa da EV4

### Oggetto
`L'anno in cui avevo quasi smesso`

---

### TESTO — EV9

Ciao {contactfield=firstname},

non ne ho mai parlato molto, ma c'è stato un anno in cui ho seriamente pensato di smettere.

Non perché il business non funzionava. Perché pensavo di non essere il tipo adatto. Troppo introverso. Poco trascinante. Poco carisma.

Conosco quel momento. Il confronto con gli altri che sembrano avercela più facile.

Quello che mi ha fatto girare la testa allora era stata un'unica conversazione con qualcuno che era già più avanti di me. Non per vendermi qualcosa. Solo per ascoltare e poi dire: "Stai già facendo le cose giuste. Smettila di confrontarti con gli altri."

Da allora è uno dei miei momenti preferiti quando parlo con qualcuno. Quel momento in cui smettono di confrontarsi e iniziano a fidarsi di sé stessi.

Se conosci quel momento, sai cosa intendo.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV10 — Mese 10
**Tipo:** Re-engagement — "Cosa è cambiato da allora" (variante 2)

### Oggetto
`{contactfield=firstname}, ho una nuova domanda che volevo farti`

---

### TESTO — EV10

Ciao {contactfield=firstname},

lo chiedo a volte a persone che conosco da un po': cosa è cambiato nella tua vita ultimamente?

Non solo sul lavoro. In generale.

Lo chiedo perché molte persone che allora "non erano pronte" lo diventano ad un certo punto. Non perché il business è diventato più semplice. Ma perché la loro situazione è cambiata. Nuove priorità. Energia diversa. Un motivo concreto che prima non c'era.

Se vuoi, rispondimi semplicemente. Cosa è cambiato per te da quando abbiamo "parlato" l'ultima volta — tramite quiz, intendo.

Nessun pitch. Solo interesse genuino.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV11 — Mese 11
**Tipo:** Valore/Insight — Numero concreto o framework

### Oggetto
`Questo numero mi ha spiegato tutto`

---

### TESTO — EV11

Ciao {contactfield=firstname},

ho condiviso un numero in una conversazione recente che per me all'epoca ha cambiato tutto.

82 percento.

È la quota di persone che dichiara di essere "non molto soddisfatta" della propria situazione professionale attuale. Non miserabile. Solo non soddisfatta. Abbastanza per andare avanti. Non abbastanza per poter davvero fiorire.

Quello che quel numero mi tocca: la maggior parte di loro sa di volere di più. Non sa solo come andare da A a B senza rischiare tutto.

Esattamente per questo faccio quello che faccio. Non per salvare il mondo. Per mostrare il percorso concreto da A a B alle persone che sanno di poter fare di più.

Se sei tra quell'82 percento: non sei solo. E c'è un modo.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

## EVERGREEN EMAIL EV12 — Mese 12
**Tipo:** Social Proof — Carattere di bilancio annuale

### Oggetto
`Un anno. Cosa è stato possibile in quest'anno.`

---

### TESTO — EV12

Ciao {contactfield=firstname},

faccio questo da qualche anno e ogni volta che guardo indietro a fine anno penso la stessa cosa.

Le persone che sono un anno più avanti di allora quasi mai sono quelle che avevano più talento. Sono quelle che hanno iniziato. E poi sono andate avanti anche quando era scomodo.

L'anno scorso diverse persone della nostra rete hanno trovato il loro primo cliente pagante. Uno ha lasciato il lavoro. Due hanno portato il loro reddito extra al livello del reddito principale. Uno lavora adesso dalla Spagna.

Non sono eccezioni. È quello che succede quando hai un percorso chiaro e lo segui.

Tu hai fatto il quiz un anno fa. È passato un anno. Non so cosa ti è successo in questo periodo.

Ma se sai di essere pronto — davvero pronto — adesso è un buon momento per una conversazione.

{contactfield=ac_berater_vorname}

---

*Ricevi questa email perché ti sei registrato su business.activecenter.info. [{unsubscribe_url} Cancella iscrizione] · [Note legali & Privacy]*

---

---

*Fine documento — Versione 1.0 — IT*
*Libreria evergreen: EV1–EV12 completa (12 mesi)*
