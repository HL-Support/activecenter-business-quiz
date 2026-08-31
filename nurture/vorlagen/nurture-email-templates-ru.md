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

## A2

**Betreff:** {contactfield=firstname}, твой код успеха

*(deutsche Referenz: {contactfield=firstname}, dein Erfolgscode)*

Здравствуй {contactfield=firstname},

Твой код успеха говорит: ты {contactfield=ac_last_profile_label}.

Твой результат — это отправная точка, а не финиш. Он показывает, как ты подходишь к делу и что для тебя действительно важно, когда ты строишь что-то своё.

В части 1 ты увидишь, о чём речь: сама модель, люди за ней и то, подходит ли это тебе и твоему следующему этапу жизни.

👉 Начни с части 1. После неё ты гораздо точнее поймёшь, твой ли это путь.

**Knopf:** Начать часть 1

Твоя команда {contactfield=ac_berater_org_display}

---

## A3

**Betreff:** Для первого шага не нужен готовый план

*(deutsche Referenz: Dein erster Schritt braucht keinen fertigen Plan)*

Здравствуй {contactfield=firstname},

Тебе пока ничего не нужно решать.

На этом месте большинство ждёт подходящего момента. Он приходит редко. А вот спокойно посмотреть в первый раз можно в любой день.

Часть 1 наводит порядок: о чём вообще речь, какого человека мы ищем и узнаёшь ли ты в этом себя.

👉 Нажми на часть 1. Готовиться не нужно. Хватит нескольких спокойных минут и честного взгляда.

**Knopf:** Начать часть 1

Твоя команда {contactfield=ac_berater_org_display}

---

## B1

**Betreff:** {contactfield=firstname}, теперь по существу

*(deutsche Referenz: {contactfield=firstname}, jetzt wird's konkret)*

Здравствуй {contactfield=firstname},

Ты посмотрел часть 1. Это больше, чем делает большинство.

Теперь ты знаешь, о чём речь. Дальше вопрос уже другой: как из интереса получается понятная система?

Часть 2 показывает конкретное устройство: как ты начинаешь, кто тебя сопровождает и как из этого может вырасти настоящая вторая опора.

👉 Нажми на часть 2. После неё будет яснее, вписывается ли этот путь в твою повседневность.

**Knopf:** Часть 2 — понять систему

Твоя команда {contactfield=ac_berater_org_display}

---

## B2

**Betreff:** {contactfield=firstname}, теперь видно всю систему

*(deutsche Referenz: {contactfield=firstname}, jetzt siehst du das System)*

Здравствуй {contactfield=firstname},

Ты посмотрел часть 1. Теперь речь о том, как это устроено.

Первого впечатления хватает для любопытства. Для решения нужен порядок действий: какие шаги в него входят, что действительно делать в начале и что реально возможно.

Именно это и есть часть 2. После неё модель уже не просто интересна — её можно проверить.

👉 Нажми на часть 2.

**Knopf:** Часть 2 — понять систему

Твоя команда {contactfield=ac_berater_org_display}

---

## C1

**Betreff:** {contactfield=firstname}, теперь о людях

*(deutsche Referenz: {contactfield=firstname}, jetzt wird's persönlich)*

Здравствуй {contactfield=firstname},

Две части позади. Дальше — реальный опыт.

Устройство ты уже знаешь. В части 3 видно, как это выглядит у живых людей.

Они начинали из очень разных ситуаций: подработка, учёба, семья, желание большей свободы.

Ищи не совершенство, а узнавание. Чья история звучит как твой следующий шаг?

👉 Нажми на часть 3.

**Knopf:** Часть 3 — реальный опыт

Твоя команда {contactfield=ac_berater_org_display}

---

## C2

**Betreff:** {contactfield=firstname}, живые люди вместо теории

*(deutsche Referenz: {contactfield=firstname}, echte Menschen statt Theorie)*

Здравствуй {contactfield=firstname},

Ты посмотрел части 1 и 2. Теперь проверка реальностью.

На бумаге модель может звучать хорошо. По-настоящему интересно становится, когда видишь, что люди с ней делают.

Часть 3 показывает реальный опыт: разные жизненные ситуации, разные старты, понятные результаты. Не шоу, а сравнение.

Обрати внимание, на какой истории ты подумаешь: «вот это мог бы быть мой следующий шаг».

👉 Нажми на часть 3.

**Knopf:** Часть 3 — реальный опыт

Твоя команда {contactfield=ac_berater_org_display}

---

## D1

**Betreff:** {contactfield=firstname}, теперь ты видел всё

*(deutsche Referenz: {contactfield=firstname}, du hast jetzt alles gesehen)*

Здравствуй {contactfield=firstname},

Три части. Целая картина.

Того, чего сейчас не хватает, нет ни в одном видео: разговора с человеком, который этот путь уже прошёл.

Этот человек — {contactfield=ac_berater_vorname}. Разговор, в котором ты поймёшь, подходит ли тебе всё это, а {contactfield=ac_berater_vorname} поймёт, сможет ли он сопровождать тебя на этом пути.

Возможно, ты уже давно ответил {contactfield=ac_berater_vorname} — сообщением или по телефону. Тогда всё в порядке, просто не обращай внимания на это письмо.

Если нет — одним нажатием дай знать, на каком ты этапе. Звучит интересно? Или сейчас не время? Оба ответа совершенно нормальны.

**Knopf:** Коротко ответить {contactfield=ac_berater_vorname}

Твоя команда {contactfield=ac_berater_org_display}

---

## D2

**Betreff:** Твой следующий шаг может быть совсем небольшим

*(deutsche Referenz: Dein nächster Schritt kann klein sein)*

Здравствуй {contactfield=firstname},

Ты посмотрел все три части. Речь сейчас не о безупречном плане.

Следующий шаг — это просто короткий ответ {contactfield=ac_berater_vorname}: интересно, пока не уверен или сейчас не подходит.

Именно из твоего ответа рождается нужный разговор. Тогда {contactfield=ac_berater_vorname} сможет вместе с тобой посмотреть, какая точка старта имеет смысл в твоей ситуации.

👉 Нажми на последний шаг. Честного ответа достаточно.

**Knopf:** Коротко ответить {contactfield=ac_berater_vorname}

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
