# Nurture-Mails — Italienisch (generische Fassung)

> 🔴 **Diese Datei wird erzeugt, nicht von Hand gepflegt.**
> Quelle: `nurture/vorlagen/generisch-hu-fr-ru.js`. Neu schreiben mit
> `node scripts/nurture-vorlagen-anlegen.js --markdown`. Wer hier etwas ändert,
> ändert nichts an dem, was verschickt wird — die Änderung gehört in die Quelldatei.

## Worum es beim Gegenlesen geht

Diese acht Mails gehen an Interessenten, die das Quiz in dieser Sprache ausgefüllt
haben. Sie kommen im Namen ihres Beraters. Bitte prüfe vor allem:

1. **Klingt es wie ein Mensch?** Nicht wie eine Übersetzung, nicht wie Werbung.
2. **Stimmt die Anrede?** Überall Du-Form, durchgehend.
3. **Ist etwas sachlich falsch oder verspricht zu viel?**
4. **Stehen die Platzhalter an der richtigen Stelle im Satz?**
   `{contactfield=…}` wird beim Versand ersetzt — durch den Vornamen, das Profil-Label,
   den Namen des Beraters. Sie dürfen NICHT übersetzt oder verschoben werden, aber der
   Satz drumherum muss grammatikalisch zu ihnen passen.

Was NICHT geprüft werden muss: Layout, Farben, Knopfform. Die sind für alle Sprachen
gleich und kommen aus derselben Vorlage.

---

## A1

**Betreff:** {contactfield=firstname}, il tuo video 1 ti aspetta (3 min)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Ciao {contactfield=firstname},

Il tuo video 1 ti aspetta e dura solo 3 minuti.

Il tuo codice del successo mostra i tuoi punti di forza e il tuo obiettivo: {contactfield=ac_last_profile_label}, con il desiderio di {contactfield=ac_last_main_goal_label}. Un profilo che sta benissimo nel nostro team.

Guarda il breve video introduttivo. Forse è proprio quello che cerchi.

**Knopf:** Guarda il video 1 (3 min)

Il tuo team {contactfield=ac_berater_org_display}

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | Il tuo referente |
| Telefon | Telefono / WhatsApp: |
| E-Mail | E-mail: |
| Hinweis Fusszeile | Ricevi questa e-mail perché ti sei registrato su `<Adresse>`. |
| Abmeldelink | Annulla iscrizione |
| Impressum | Note legali &amp; privacy |
