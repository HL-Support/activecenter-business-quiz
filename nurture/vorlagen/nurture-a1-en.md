# Nurture-Mails — Englisch (generische Fassung)

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

**Betreff:** {contactfield=firstname}, your video 1 is waiting (3 min)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Hi {contactfield=firstname},

Your video 1 is waiting — and it only takes 3 minutes.

It puts your success code into context: what it means that you are {contactfield=ac_last_profile_label} — and which next step fits your type.

**Knopf:** Watch video 1 (3 min)

Your {contactfield=ac_berater_org_display} team

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | Your contact person |
| Telefon | Phone / WhatsApp: |
| E-Mail | Email: |
| Hinweis Fusszeile | You are receiving this email because you signed up at `<Adresse>`. |
| Abmeldelink | Unsubscribe |
| Impressum | Imprint &amp; privacy |
