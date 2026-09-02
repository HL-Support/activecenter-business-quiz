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

## A2

**Betreff:** {contactfield=firstname}, voici ton code de réussite

*(deutsche Referenz: {contactfield=firstname}, dein Erfolgscode)*

Bonjour {contactfield=firstname},

Ton code de réussite le dit : tu es {contactfield=ac_last_profile_label}.

Ton résultat est un point de départ, pas une arrivée. Il montre comment tu abordes les choses et ce qui compte vraiment pour toi quand tu construis quelque chose qui t'appartient.

Dans la partie 1, tu vois de quoi il s'agit : le modèle, les personnes derrière, et si tout cela correspond à toi et à ta prochaine étape de vie.

👉 Commence par la partie 1. Ensuite, tu sauras bien mieux si ce chemin te convient.

**Knopf:** Démarrer la partie 1

Ton équipe {contactfield=ac_berater_org_display}

---

## A3

**Betreff:** Ton premier pas n'a pas besoin d'un plan tout prêt

*(deutsche Referenz: Dein erster Schritt braucht keinen fertigen Plan)*

Bonjour {contactfield=firstname},

Tu n'as encore rien à décider.

À ce stade, la plupart attendent le bon moment. Il vient rarement. Ce qui est toujours possible, c'est un premier regard tranquille.

La partie 1 met de l'ordre : de quoi il s'agit, quel type de personne nous cherchons, et si tu t'y reconnais.

👉 Clique maintenant sur la partie 1. Aucune préparation nécessaire. Juste quelques minutes au calme et un regard honnête.

**Knopf:** Démarrer la partie 1

Ton équipe {contactfield=ac_berater_org_display}

---

## B1

**Betreff:** {contactfield=firstname}, on passe au concret

*(deutsche Referenz: {contactfield=firstname}, jetzt wird's konkret)*

Bonjour {contactfield=firstname},

Tu as vu la partie 1. Ça, la plupart des gens ne le font pas.

Tu sais maintenant de quoi il s'agit. La question suivante est différente : comment transformer un intérêt en système clair ?

La partie 2 te montre la construction concrète : comment tu démarres, qui t'accompagne, et comment cela peut devenir une vraie seconde activité.

👉 Clique maintenant sur la partie 2. Ensuite, tu verras plus clairement si ce chemin tient dans ton quotidien.

**Knopf:** Partie 2 - Comprendre le système

Ton équipe {contactfield=ac_berater_org_display}

---

## B2

**Betreff:** {contactfield=firstname}, voici le système

*(deutsche Referenz: {contactfield=firstname}, jetzt siehst du das System)*

Bonjour {contactfield=firstname},

Tu as vu la partie 1. Passons à la construction.

Une première impression suffit pour la curiosité. Pour décider, il faut un déroulé : quelles étapes en font partie, ce qu'il y a vraiment à faire au début, et ce qui est réellement possible.

C'est exactement la partie 2. Ensuite, le modèle n'est plus seulement intéressant — tu peux l'examiner.

👉 Clique maintenant sur la partie 2.

**Knopf:** Partie 2 - Comprendre le système

Ton équipe {contactfield=ac_berater_org_display}

---

## C1

**Betreff:** {contactfield=firstname}, place au personnel

*(deutsche Referenz: {contactfield=firstname}, jetzt wird's persönlich)*

Bonjour {contactfield=firstname},

Deux parties vues. Place aux expériences réelles.

Tu connais maintenant la construction. Dans la partie 3, tu vois ce que ça donne chez de vraies personnes.

Elles sont parties de situations très différentes : un emploi à côté, des études, une famille, l'envie de plus de liberté.

Ne cherche pas la perfection, cherche la reconnaissance. Quelle expérience ressemble à ton prochain pas ?

👉 Clique maintenant sur la partie 3.

**Knopf:** Partie 3 - Voir les expériences réelles

Ton équipe {contactfield=ac_berater_org_display}

---

## C2

**Betreff:** {contactfield=firstname}, des personnes réelles plutôt que de la théorie

*(deutsche Referenz: {contactfield=firstname}, echte Menschen statt Theorie)*

Bonjour {contactfield=firstname},

Tu as vu les parties 1 et 2. Passons à la vérification par le réel.

Un modèle peut bien sonner sur le papier. Il devient intéressant quand on voit ce que les gens en font vraiment.

La partie 3 montre des expériences réelles : des situations de vie différentes, des départs différents, des résultats clairs. Pas un spectacle, une comparaison.

Repère l'expérience qui te fait penser : « ça pourrait être mon prochain pas ».

👉 Clique maintenant sur la partie 3.

**Knopf:** Partie 3 - Voir les expériences réelles

Ton équipe {contactfield=ac_berater_org_display}

---

## D1

**Betreff:** {contactfield=firstname}, tu as maintenant tout vu

*(deutsche Referenz: {contactfield=firstname}, du hast jetzt alles gesehen)*

Bonjour {contactfield=firstname},

Trois parties. Une image complète.

Ce qui manque maintenant n'est dans aucune vidéo : une conversation avec quelqu'un qui a déjà fait ce chemin.

Cette personne, c'est {contactfield=ac_berater_vorname}. Un échange où tu découvres si tout cela te correspond — et où {contactfield=ac_berater_vorname} découvre s'il peut t'accompagner sur ce chemin.

Peut-être as-tu déjà répondu à {contactfield=ac_berater_vorname}, par message ou par téléphone. Dans ce cas tout va bien, ignore cet e-mail.

Sinon : dis en un clic où tu en es. Ça t'intéresse ? Ou pas en ce moment ? Les deux réponses sont parfaitement acceptables.

**Knopf:** Répondre brièvement à {contactfield=ac_berater_vorname}

Ton équipe {contactfield=ac_berater_org_display}

---

## D2

**Betreff:** Ton prochain pas peut être tout petit

*(deutsche Referenz: Dein nächster Schritt kann klein sein)*

Bonjour {contactfield=firstname},

Tu as vu les trois parties. Il ne s'agit pas d'avoir un plan parfait.

Le prochain pas, c'est simplement une courte réponse à {contactfield=ac_berater_vorname} : intéressé, hésitant, ou pas au bon moment.

C'est de ta réponse que naît la bonne conversation. {contactfield=ac_berater_vorname} pourra alors regarder avec toi quel point de départ a du sens dans ta situation.

👉 Clique maintenant sur la dernière étape. Une réponse honnête suffit.

**Knopf:** Répondre brièvement à {contactfield=ac_berater_vorname}

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
