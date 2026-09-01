# Nurture-Mails — Deutsch (generische Fassung)

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

**Betreff:** {contactfield=firstname}, dein Video 1 wartet (3 Min)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Hi {contactfield=firstname},

Dein Video 1 wartet — und es dauert nur 3 Minuten.

Darin bekommt dein Erfolgs-Code seine Bedeutung: was es heißt, dass du {contactfield=ac_last_profile_label} bist — und welcher nächste Schritt zu deinem Typ passt.

**Knopf:** Video 1 ansehen (3 Min)

Dein {contactfield=ac_berater_org_display} Team

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | Dein Ansprechpartner |
| Telefon | Telefon / WhatsApp: |
| E-Mail | E-Mail: |
| Hinweis Fusszeile | Du erhältst diese Mail weil du dich auf `<Adresse>` eingetragen hast. |
| Abmeldelink | Abmelden |
| Impressum | Impressum &amp; Datenschutz |
