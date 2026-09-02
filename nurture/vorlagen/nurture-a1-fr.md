# Nurture-Mails — Französisch (generische Fassung)

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

**Betreff:** {contactfield=firstname}, ta vidéo 1 t'attend (3 min)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Salut {contactfield=firstname},

Ta vidéo 1 t'attend et elle ne dure que 3 minutes.

Ton code du succès montre tes forces et ton objectif : {contactfield=ac_last_profile_label}, avec « {contactfield=ac_last_main_goal_label} » comme moteur. Un profil qui a toute sa place dans notre équipe.

Regarde la courte vidéo d'introduction. C'est peut-être exactement ce que tu cherches.

**Knopf:** Regarder la vidéo 1 (3 min)

Ton équipe {contactfield=ac_berater_org_display}

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | Ton interlocuteur |
| Telefon | Téléphone / WhatsApp : |
| E-Mail | E-mail : |
| Hinweis Fusszeile | Tu reçois cet e-mail parce que tu t'es inscrit sur `<Adresse>`. |
| Abmeldelink | Se désabonner |
| Impressum | Mentions légales et confidentialité |
