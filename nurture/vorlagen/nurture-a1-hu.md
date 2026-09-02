# Nurture-Mails — Ungarisch (generische Fassung)

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

**Betreff:** {contactfield=firstname}, vár az 1. videód (3 perc)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Szia {contactfield=firstname},

Vár az 1. videód, és csak 3 percig tart.

A sikerkódod megmutatja az erősségeidet és a célodat: {contactfield=ac_last_profile_label}, cél: {contactfield=ac_last_main_goal_label}. Ez a profil remekül illik a csapatunkba.

Nézd meg a rövid bevezető videót. Lehet, hogy pont ezt keresed.

**Knopf:** 1. videó megnézése (3 perc)

A {contactfield=ac_berater_org_display} csapatod

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | A kapcsolattartód |
| Telefon | Telefon / WhatsApp: |
| E-Mail | E-mail: |
| Hinweis Fusszeile | Ezt a levelet azért kapod, mert feliratkoztál itt: `<Adresse>`. |
| Abmeldelink | Leiratkozás |
| Impressum | Impresszum és adatvédelem |
