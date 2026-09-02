# Nurture-Mails — Russisch (generische Fassung)

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

**Betreff:** {contactfield=firstname}, твоё видео 1 ждёт тебя (3 мин)

*(deutsche Referenz: {contactfield=firstname}, dein Video 1 wartet (3 Min))*

Привет {contactfield=firstname},

Твоё видео 1 ждёт тебя, и оно длится всего 3 минуты.

Твой код успеха показывает твои сильные стороны и главную цель: {contactfield=ac_last_profile_label}, цель «{contactfield=ac_last_main_goal_label}». Такой профиль отлично подходит нашей команде.

Посмотри короткое вводное видео. Возможно, это именно то, что ты ищешь.

**Knopf:** Смотреть видео 1 (3 мин)

Твоя команда {contactfield=ac_berater_org_display}

---

## Fester Rahmen (Beraterkasten und Fusszeile)

| | Text |
| --- | --- |
| Überschrift Beraterkasten | Твой контакт |
| Telefon | Телефон / WhatsApp: |
| E-Mail | E-mail: |
| Hinweis Fusszeile | Ты получаешь это письмо, потому что зарегистрировался на `<Adresse>`. |
| Abmeldelink | Отписаться |
| Impressum | Выходные данные и защита данных |
