/* eslint-disable */
import { useState } from "react";

const C = {
  fire: "#C0392B", fireBg: "#FEF0EE",
  wind: "#A07010", windBg: "#FFFBEB",
  water: "#1A7A4A", waterBg: "#EAF7F0",
  rock: "#1A5F9A", rockBg: "#EBF3FC",
  gold: "#B8860B", goldBg: "#FFFBF0",
  dark: "#1A1A2E", mid: "#4A4A6A", light: "#8A8AAA",
  page: "#F8F7F4", white: "#FFFFFF",
};

const PROFILES = [
  {
    id: "feuer", emoji: "🔥", name: "Der Macher", element: "Feuer",
    color: C.fire, bg: C.fireBg,
    tagline: "Entschlossen. Direkt. Ergebnisorientiert.",
    psychologie: "Der Macher denkt in Resultaten, nicht in Prozessen. Er will wissen WAS rauskommt und WIE SCHNELL. Smalltalk kostet ihn Zeit. Wenn er das Gefühl hat, dass jemand um den heissen Brei redet, ist er innerlich schon weg.",
    stärken: ["Schnelle, klare Entscheidungskraft", "Konsequent vom Plan zur Umsetzung", "Natürliche Führungspersönlichkeit", "Selbstgetrieben und unabhängig"],
    fleck: "Kann ungeduldig wirken, hört manchmal zu wenig zu, Gefahr der Überschätzung.",
    niemals: "Langatmige Erklärungen, Weichspüler-Sprache, zu viel Empathie-Theater.",
    aspirations: [
      { id: "freiheit", emoji: "🕊️", label: "Freiheit",
        antrieb: "Er will der Kapitän sein – keine Erlaubnis brauchen, keine Decke über sich. Freiheit bedeutet maximale Handlungsmacht.",
        nein: "Hierarchien die ihn bremsen. Systeme die zu langsam skalieren.",
        opener: "Ich zeige dir kurz wie das Modell funktioniert. Kein Blabla – einfach Zahlen und Struktur. Dann entscheidest du selbst.",
        gespräch: "Sprich über Skalierung, Tempo und Kontrolle. Zeig ihm dass er der Boss seines eigenen Bereichs ist. Konkrete Zahlen von anderen Machern – keine Durchschnittswerte.",
        überzeugt: "Echte Zahlen von echten Menschen. Er will sehen: Was hat jemand mit seinem Einsatz in 6 Monaten erreicht?",
        einwände: [
          { q: "Ich habe keine Zeit dafür.", a: "Genau deshalb. Wer dauerhaft keine Zeit hat, hat das falsche System. Wie viele Stunden wärst du bereit zu investieren?" },
          { q: "Klingt nach MLM.", a: "Ich verstehe die Reaktion. Lass mich dir in 5 Minuten den strukturellen Unterschied zeigen. Dann kannst du selbst urteilen." },
        ],
        redflag: "Wenn er ständig fragt wann er Geld sieht, ohne selbst Verantwortung übernehmen zu wollen." },
      { id: "wirkung", emoji: "🌱", label: "Wirkung",
        antrieb: "Er will Spuren hinterlassen. Andere mitziehen, etwas aufbauen das größer ist als er selbst. Wirkung ist für ihn der Beweis echter Führungsqualität.",
        nein: "Ein Business das nur um ihn kreist. Isolation. Ein Modell das ihn klein hält.",
        opener: "Du bist jemand der nicht nur für sich denkt – das merkt man. Ich zeige dir, wie du das in ein System übersetzen kannst, das wirklich skaliert.",
        gespräch: "Zeig ihm die Hebelwirkung: nicht was ER tut, sondern was durch ihn entsteht. Wie viele Menschen kann er durch sein Team beeinflussen?",
        überzeugt: "Geschichten von Machern die Teams aufgebaut haben. Zahlen über Teamgrößen, nicht nur Einzeleinkommen.",
        einwände: [
          { q: "Ich will nicht andere anwerben müssen.", a: "Du wirst niemanden anwerben. Du wirst Menschen einladen die selbst etwas verändern wollen. Der Unterschied ist entscheidend." },
          { q: "Ich bin kein Verkäufer.", a: "Macher die wirklich führen müssen nicht verkaufen. Sie inspirieren. Genau das tust du schon." },
        ],
        redflag: "Wenn er Wirkung nur als Ego-Bestätigung sucht, nicht als echten Service an anderen." },
      { id: "sicherheit", emoji: "🏠", label: "Sicherheit",
        antrieb: "Hinter dem Macher-Auftreten steckt die tiefe Verantwortung für Familie und Zukunft. Er will groß denken – aber auf einem Fundament das nicht wackelt.",
        nein: "Luftschlösser. Versprechen ohne Substanz. Risiken die er nicht kalkulieren kann.",
        opener: "Du willst vorwärts – aber auf einem Boden der hält. Ich zeige dir wie das hier strukturiert ist und warum das Risiko überschaubar ist.",
        gespräch: "Zahlen, Zeitlinie, realistische Szenarien. Was ist der konservative Pfad? Was ist der Worst Case?",
        überzeugt: "Transparenz. Er will das Modell verstehen bevor er Ja sagt. Gib ihm Zeit und Fakten.",
        einwände: [
          { q: "Was passiert wenn ich kein Team aufbaue?", a: "Dann hast du das Produktgeschäft. Das läuft unabhängig. Teamaufbau ist eine Option, keine Pflicht." },
          { q: "Ich will nicht von anderen abhängig sein.", a: "Verstehe ich. Was hast du heute an sicheren Einnahmequellen – dann sehen wir ob das eine sinnvolle Ergänzung ist." },
        ],
        redflag: "Wenn er nach jeder Antwort neue Einwände produziert ohne wirklich zuzuhören." },
      { id: "wachstum", emoji: "📈", label: "Wachstum",
        antrieb: "Er will der Beste werden. Nicht nur im Business – er will sich selbst übertreffen. Wachstum ist für den Macher Sport.",
        nein: "Stagnation. Ein Umfeld das ihn nicht fordert. Coaches die weniger können als er.",
        opener: "Ich arbeite mit Menschen die nie aufhören zu wachsen. Das ist genau das Umfeld das dich weiterbringt – nicht nur das System, sondern die Leute darin.",
        gespräch: "Sprich über Entwicklung: Skills, Führung, Unternehmertum. Wer sind die Top-Performer im Team?",
        überzeugt: "Der Beweis dass es Menschen im Team gibt die ihn herausfordern. Er will im besten Raum sein, nicht der Größte.",
        einwände: [
          { q: "Ich lerne lieber alleine.", a: "Das glaube ich dir. Aber die besten Macher die ich kenne lernen von anderen Machern – nicht aus Büchern." },
          { q: "Was kann ich hier lernen was ich nicht schon weiß?", a: "Das weiß ich nicht. Sag mir wo du stehst – dann sage ich dir ehrlich ob das Neuland ist." },
        ],
        redflag: "Wenn er Wachstum als Ausrede nutzt um nie ins Handeln zu kommen." },
    ]
  },
  {
    id: "wind", emoji: "💨", name: "Der Netzwerker", element: "Wind",
    color: C.wind, bg: C.windBg,
    tagline: "Begeisternd. Menschlich. Energiegeladen.",
    psychologie: "Der Netzwerker lebt für Menschen, Verbindungen und Stimmungen. Er kauft Emotionen, nicht Fakten. Er muss dich mögen bevor er dir zuhört. Wenn die Energie stimmt, ist er sofort dabei.",
    stärken: ["Ansteckende Begeisterungsfähigkeit", "Vertrauen in kürzester Zeit aufgebaut", "Verbindender Kitt in jedem Team", "Unwiderstehlich positive Ausstrahlung"],
    fleck: "Springt von Idee zu Idee, folgt manchmal Begeisterung statt Vernunft.",
    niemals: "Trockene Zahlen ohne Kontext, kalte Präsentation, kein Lächeln. Er muss spüren dass du ihn magst.",
    aspirations: [
      { id: "freiheit", emoji: "🕊️", label: "Freiheit",
        antrieb: "Freiheit bedeutet für ihn: jeden Tag aufwachen und frei entscheiden mit wem er Zeit verbringt. Spontan reisen. Das Leben geniessen während er arbeitet.",
        nein: "Starre Strukturen, eintönige Routine, Menschen die seine Energie runterziehen.",
        opener: "Stell dir vor du wachst morgen auf und entscheidest selbst wer auf deiner Agenda steht. Ich zeige dir wie das aussieht.",
        gespräch: "Zeichne das Bild. Nicht Zahlen – Bilder. Wie sieht sein Alltag aus? Wann und wo arbeitet er? Mit wem?",
        überzeugt: "Geschichten von Menschen im Team die dieses Leben leben. Echte Momente. Er kauft das Lifestyle-Bild.",
        einwände: [
          { q: "Ich bin zu gesellig, ich will nicht zuhause sitzen.", a: "Du arbeitest genau dort wo die Menschen sind – auf Events, am Telefon, in Cafés. Das ist dein Büro." },
          { q: "Das braucht bestimmt viel Zeit am Anfang.", a: "Am Anfang ja. Aber wie viel Zeit investierst du heute für ein Leben das dir nicht gehört?" },
        ],
        redflag: "Wenn er begeistert ist aber nie verbindlich wird. Immer neue Termine, immer fast dabei." },
      { id: "wirkung", emoji: "🌱", label: "Wirkung",
        antrieb: "Er will sehen wie seine Energie anderen hilft. Die Reaktion wenn jemand sagt: Du hast mein Leben verändert. Er liebt es, gebraucht zu werden.",
        nein: "Sich nutzlos fühlen. Kein Feedback bekommen. Ohne Verbindung arbeiten.",
        opener: "Du hast eine Gabe die die meisten nie entwickeln: du bewegst Menschen. Ich zeige dir wie du das in etwas Großes übersetzen kannst.",
        gespräch: "Fokus auf Impact: wie viele Menschen hat er bisher unbewusst beeinflusst? Was wäre wenn er das systematisch tun könnte?",
        überzeugt: "Testimonials, Erfolgsgeschichten, emotionale Momente. Er muss spüren dass hier echte Menschen wirklich geholfen werden.",
        einwände: [
          { q: "Ich will nicht Produkte pushen.", a: "Du pushst keine Produkte. Du teilst was dir geholfen hat. Der Unterschied liegt in der Echtheit – und die hast du." },
          { q: "Was wenn die Produkte nicht wirken?", a: "Nutze sie selbst. Dann kannst du aus echter Erfahrung sprechen – das ist das Einzige was zählt." },
        ],
        redflag: "Wenn er Wirkung will aber keine eigene Erfahrung machen möchte." },
      { id: "sicherheit", emoji: "🏠", label: "Sicherheit",
        antrieb: "Hinter seiner Leichtigkeit steckt die tiefe Sorge um sein Umfeld – Familie, Freunde. Sicherheit ist für ihn emotionale Verlässlichkeit.",
        nein: "Das Gefühl jemanden im Stich zu lassen. Finanzielle Unsicherheit die auf Beziehungen drückt.",
        opener: "Ich weiß dass du für andere da sein willst – ich zeige dir wie du das auch finanziell absichern kannst ohne deine Art zu leben aufzugeben.",
        gespräch: "Verbinde das Einkommen direkt mit dem was ihm wichtig ist: mehr Zeit für Familie, weniger Stress.",
        überzeugt: "Realistische Einkommensbeispiele von normalen Menschen mit seinem Profil. Er muss es für sich glauben können.",
        einwände: [
          { q: "Ich will keine Risiken eingehen.", a: "Was wäre das schlimmste Szenario? Lass uns das gemeinsam durchdenken. Ich rede nicht schön." },
          { q: "Was wenn meine Freunde mich schief anschauen?", a: "Das ist eine echte Angst und ich respektiere sie. Lass mich dir zeigen wie andere das gehandhabt haben." },
        ],
        redflag: "Wenn die Meinung anderer so stark ist, dass er keine eigene Entscheidung treffen kann." },
      { id: "wachstum", emoji: "📈", label: "Wachstum",
        antrieb: "Er will sich entwickeln, neue Seiten entdecken, besser werden im Umgang mit Menschen. Stagnation ist sein größter Feind.",
        nein: "Isolation, Routine, Menschen die ihn nicht inspirieren.",
        opener: "Du weißt dass du mehr in dir hast. Ich zeige dir ein Umfeld, das dieses Mehr wirklich rausholt.",
        gespräch: "Fokus auf Community, Events, gemeinsames Wachstum. Er muss die Energie FÜHLEN bevor er entscheidet.",
        überzeugt: "Einladung zu einem Event oder Team-Call. Kein Dokument überzeugt ihn so wie ein echter Raum voller Energie.",
        einwände: [
          { q: "Ich bin schon in vielen Projekten.", a: "Was hat davon wirklich dein Leben verändert – und was hat es nur beschäftigt?" },
          { q: "Ich brauche erstmal mehr Infos.", a: "Der beste Weg um echte Infos zu bekommen ist ein echter Mensch aus dem Team. Darf ich dich verbinden?" },
        ],
        redflag: "Wenn er von Begeisterung zu Begeisterung zieht ohne je anzukommen." },
    ]
  },
  {
    id: "wasser", emoji: "🌊", name: "Der Anker", element: "Wasser",
    color: C.water, bg: C.waterBg,
    tagline: "Loyal. Verlässlich. Tief.",
    psychologie: "Der Anker entscheidet langsam aber hält dann dauerhaft. Er braucht Sicherheit, Vertrauen und Zeit – keinen Druck. Wenn er Druck spürt, zieht er sich zurück. Er ist Gold wenn er einmal dabei ist: loyal, ausdauernd, der Kitt im Team.",
    stärken: ["Absolut verlässlich und wortgetreu", "Tiefes, dauerhaftes Vertrauensfundament", "Ruhepol in jeder Krisensituation", "Ausgeglichen und konfliktfrei"],
    fleck: "Entscheidet sehr langsam, braucht viel Bestätigung, kann uubergangen werden ohne es zu sagen.",
    niemals: "Druck, künstliche Deadlines, überreden. Er merkt jede Manipulation und vergisst sie nie.",
    aspirations: [
      { id: "freiheit", emoji: "🕊️", label: "Freiheit",
        antrieb: "Freiheit bedeutet für den Anker: Ruhe ohne Existenzangst. Nicht müssen müssen. Er will keine wilden Abenteuer – er will frei sein von Zwang.",
        nein: "Chaos, Unvorhersehbarkeit, das Gefühl die Kontrolle zu verlieren.",
        opener: "Was wäre, wenn du weiter deinen Alltag lebst – aber nebenbei ein Einkommen aufbaust das dir irgendwann Optionen gibt?",
        gespräch: "Kein Druck, kein Tempo. Zeig den sanften Einstieg. Was ist der kleinste erste Schritt? Was kostet es wirklich?",
        überzeugt: "Beispiele von Menschen die dieses Modell neben ihrem Leben aufgebaut haben ohne alles auf den Kopf zu stellen.",
        einwände: [
          { q: "Ich bin nicht der Typ dafür.", a: "Was meinst du damit – was stellst du dir vor müsstest du tun?" },
          { q: "Ich brauche Zeit zum Nachdenken.", a: "Selbstverständlich. Was brauchst du konkret um eine Entscheidung treffen zu können?" },
        ],
        redflag: "Wenn er ewig nachdenkt ohne je eine konkrete Frage zu stellen." },
      { id: "wirkung", emoji: "🌱", label: "Wirkung",
        antrieb: "Er hilft am liebsten im Verborgenen. Er will wissen dass sein Tun etwas bewegt – ohne im Rampenlicht zu stehen. Wirkung für ihn ist still und tief.",
        nein: "Öffentlichkeit die er nicht will. Erwartungen die über sein Komfortniveau gehen.",
        opener: "Stell dir vor du hilfst Menschen – ganz in deinem Tempo, auf deine Art. Ohne Show, ohne Bühne. Einfach echt.",
        gespräch: "Zeig wie er im Hintergrund Großes bewirken kann. Echte Kundenstories, die stille Konstanz die sein Team braucht.",
        überzeugt: "Echte, ruhige Geschichten von Menschen wie ihm. Keine Bühnen-Momente.",
        einwände: [
          { q: "Ich bin zu introvertiert dafür.", a: "Die stärksten Menschen im Team sind oft genau die, die am ruhigsten auftreten. Darf ich dir zeigen warum?" },
          { q: "Ich will nicht mein Netzwerk belasten.", a: "Du musst niemanden belasten. Du bietest an – und wer es nicht will, sagt nein." },
        ],
        redflag: "Wenn jeder Schritt als Bedrohung wirkt – zuerst ein echtes Produkterlebnis schaffen." },
      { id: "sicherheit", emoji: "🏠", label: "Sicherheit",
        antrieb: "Sicherheit IST sein primäres Ziel. Er denkt an Partner, Kinder, Eltern. Er trägt Verantwortung still und ernsthaft.",
        nein: "Jedes Risiko das er nicht versteht. Versprechen die nicht gehalten werden.",
        opener: "Ich zeige dir kein schnelles Geld – ich zeige dir wie andere in deiner Situation ein ruhiges, stabiles Nebeneinkommen aufgebaut haben.",
        gespräch: "Sehr langsam, sehr ehrlich. Sag auch was nicht funktioniert – das baut mehr Vertrauen als Hochglanz.",
        überzeugt: "Zeit und Beweise. Mehrere Gespräche sind normal. Wer ihn pusht, verliert ihn. Wer ihm Raum gibt, gewinnt einen Partner für Jahre.",
        einwände: [
          { q: "Was wenn das nicht funktioniert?", a: "Lass uns den Worst Case durchgehen – danach kannst du selbst beurteilen ob das Risiko tragbar ist." },
          { q: "Ich muss das mit meinem Partner besprechen.", a: "Absolut richtig. Soll ich euch beiden einen kurzen Überblick geben? Dann seid ihr auf demselben Stand." },
        ],
        redflag: "Wenn er nach 3-4 Gesprächen noch keine einzige konkrete Frage gestellt hat." },
      { id: "wachstum", emoji: "📈", label: "Wachstum",
        antrieb: "Er will tiefer werden, nicht breiter. Nicht 10 neue Skills – einen wirklich gut. Er wächst durch Verlässlichkeit und Konsequenz, nicht durch Hype.",
        nein: "Oberflächlichkeit, ständige Veränderungen, ein System das sich jede Woche neu erfindet.",
        opener: "Wachstum für dich ist kein Crash-Kurs – es ist die ruhige Konsequenz die andere nicht haben. Genau das wird hier gebaut.",
        gespräch: "Zeig die Tiefe des Systems. Wer coacht ihn auf dem Weg? Welche Schulungen gibt es?",
        überzeugt: "Ein Mentor aus dem Team der ähnlich strukturiert ist – ruhig, ausdauernd, tief. Ein Gespräch mit dieser Person ist mehr wert als jede Präsentation.",
        einwände: [
          { q: "Ich brauche lange bis ich bereit bin.", a: "Das ist keine Schwäche. Die besten Leute im Team sind genau so. Wann wärst du bereit für ein erstes Gespräch?" },
          { q: "Gibt es viel Druck und schnelle Ergebnisse?", a: "Nein. Dein Tempo ist dein Tempo. Was zählt ist Richtung, nicht Geschwindigkeit." },
        ],
        redflag: "Wenn er Wachstum als Grund nutzt um nie anzufangen – immer noch ein Buch, noch ein Kurs." },
    ]
  },
  {
    id: "fels", emoji: "🪨", name: "Der Architekt", element: "Fels",
    color: C.rock, bg: C.rockBg,
    tagline: "Analytisch. Präzise. Systemisch.",
    psychologie: "Der Architekt kauft mit dem Kopf, nicht mit dem Bauch. Er analysiert bevor er handelt. Wenn du ihn mit Druck überwältigst, verlierst du ihn. Wenn du ihm Fakten und Raum gibst, gewinnst du einen langjährigen Partner.",
    stärken: ["Durchdachte, fundierte Entscheidungsqualität", "Systemischer Denker mit Weitblick", "Konsequenter Optimierer mit Präzision", "Intrinsisch motiviert und unabhängig"],
    fleck: "Kann in Analyse-Schleifen stecken bleiben, entscheidet langsam.",
    niemals: "Hype, übertriebene Versprechen, emotionale Manipulation. Er durchschaut das sofort.",
    aspirations: [
      { id: "freiheit", emoji: "🕊️", label: "Freiheit",
        antrieb: "Freiheit bedeutet für ihn: ein System besitzen das ohne seine ständige Anwesenheit läuft. Er will Kontrolle UND Unabhängigkeit.",
        nein: "Abhängigkeit von einem Arbeitgeber, von einem Kunden, von Launen anderer.",
        opener: "Ich zeige dir die Mechanik dahinter – wie das System aufgebaut ist und warum es auch dann läuft, wenn du nicht aktiv bist.",
        gespräch: "Erkläre die Struktur: Einkommensquellen, Hebelwirkung, Skalierbarkeit. Er will alles verstehen bevor er ein Detail bewertet.",
        überzeugt: "Schriftliche Unterlagen, klare Dokumente, echte Zahlen. Er wird alles gründlich lesen. Ruf 3 Tage später an.",
        einwände: [
          { q: "Ich muss das gründlich analysieren.", a: "Genau das erwarte ich von dir. Hier ist alles was du brauchst – was fehlt dir noch?" },
          { q: "Was sind die versteckten Kosten?", a: "Lass mich das komplett transparent aufschlüsseln – keine Überraschungen." },
        ],
        redflag: "Wenn er nach vollständiger Information immer noch neue Fragen produziert ohne je eine zu beantworten." },
      { id: "wirkung", emoji: "🌱", label: "Wirkung",
        antrieb: "Er will nicht nur ein System bauen – er will dass es wirklich etwas verändert. Wirkung ohne Substanz interessiert ihn nicht.",
        nein: "Oberflächlichkeit. Greenwashing. Versprechen die nicht messbar sind.",
        opener: "Ich zeige dir wie das Modell echte, messbare Wirkung erzeugt – mit Zahlen und Feedback von echten Menschen.",
        gespräch: "Zeig die Wirkungskette: Produkt zu Mensch zu Veränderung. Er will die Kausalität verstehen.",
        überzeugt: "Studien, Produktdaten, schriftliche nachvollziehbare Belege. Keine Testimonial-Videos.",
        einwände: [
          { q: "Wie weiß ich dass die Produkte wirklich wirken?", a: "Hier sind die verfügbaren Studien und klinischen Daten. Was davon ist für dich am relevantesten?" },
          { q: "Ich habe Bedenken gegenüber der Branche.", a: "Die Bedenken sind berechtigt. Lass mich zeigen wo der Unterschied liegt – fachlich, strukturell, rechtlich." },
        ],
        redflag: "Wenn er Wirkung als intellektuelle Übung betrachtet aber nie selbst etwas ausprobiert." },
      { id: "sicherheit", emoji: "🏠", label: "Sicherheit",
        antrieb: "Er will Risiken vollständig verstehen und kontrollieren. Sicherheit heißt: keine unbekannten Variablen, keine Überraschungen.",
        nein: "Intransparenz, unklare Vertragsstrukturen, Abhängigkeit von unkontrollierbaren Faktoren.",
        opener: "Bevor du entscheidest zeige ich dir die gesamte Struktur – alle Kosten, alle Risiken, alle Optionen. Echte Basis, echte Entscheidung.",
        gespräch: "Extrem transparent. Zeig auch die Nachteile. Was kann schiefgehen? Wenn er merkt dass du ehrlich bist, öffnet er sich.",
        überzeugt: "Ein Gespräch mit jemandem der schon dabei ist – realistisch, kritisch, ehrlich.",
        einwände: [
          { q: "Was ist wenn ich aussteigen will?", a: "Du kannst jederzeit aufhören. Keine Mindestlaufzeit, keine Kündigungsfristen. Hier ist der genaue Prozess." },
          { q: "Wie verlässlich ist das Einkommen wirklich?", a: "Ich werde das nicht schönreden. Hier sind reale Einkommensbereiche nach 3, 6 und 12 Monaten." },
        ],
        redflag: "Wenn er nach vollständiger transparenter Information immer noch misstrauisch ist – das braucht Zeit, kein mehr an Fakten." },
      { id: "wachstum", emoji: "📈", label: "Wachstum",
        antrieb: "Er will Meisterschaft. Nicht breites Wissen – tiefes Verstehen. Er will das System so gut kennen dass er es optimieren kann.",
        nein: "Oberflächliche Trainings. Coaches die weniger verstehen als er. Systeme die er nicht verbessern darf.",
        opener: "Du bist der Typ der ein System nicht nur nutzt, sondern es besser macht. Genau solche Menschen suchen wir für die nächste Ebene.",
        gespräch: "Zeig die Tiefe: Produktwissen, Businessstrategie, Systemaufbau. Wo kann er wirklich tief einsteigen?",
        überzeugt: "Zugang zu echten Experten im Team. Kein Motivationsredner – ein Fachmensch der auf hohem Niveau optimiert hat.",
        einwände: [
          { q: "Ich habe schon viel Erfahrung im Vertrieb.", a: "Umso besser. Dann weißt du was funktioniert. Was fehlt dir noch in deinem aktuellen Modell?" },
          { q: "Ist das nicht zu simpel für mich?", a: "Was du siehst ist die Oberflächlichkeit. Die Tiefe darunter hat noch niemanden der wirklich hingeschaut hat, gelangweilt." },
        ],
        redflag: "Wenn er alles kritisiert ohne je selbst etwas auszuprobieren – intellektuelle Arroganz als Selbstschutz." },
    ]
  },
];

const RULES = [
  { nr: "01", title: "Sprich die Sprache des Typs, nicht deine eigene.", text: "Der Macher will Ergebnisse hören. Der Netzwerker will Geschichten fühlen. Der Anker will Sicherheit spüren. Der Architekt will Fakten sehen. Wenn du mit allen gleich redest, erreichst du keinen wirklich." },
  { nr: "02", title: "Stelle Fragen bevor du erklärst.", text: "Das Einzige was jemanden wirklich überzeugt ist das was er selbst sagt. Deine Aufgabe ist nicht zu reden – sondern die richtigen Fragen zu stellen, damit er selbst herausfindet was er will." },
  { nr: "03", title: "Niemals Druck. Niemals Manipulation.", text: "Jedes Mal wenn du Druck ausuebst verlierst du Vertrauen – auch wenn er am Ende Ja sagt. Das beste Ja kommt aus echtem Verständnis." },
  { nr: "04", title: "Einwände sind kein Nein – sie sind Fragen ohne Fragezeichen.", text: "Klingt nach MLM = Erklär mir den Unterschied. Keine Zeit = Überzeug mich dass es das wert ist. Höre hinter die Worte." },
  { nr: "05", title: "Das Ergebnis ist nicht der Abschluss – es ist die Beziehung.", text: "Menschen die kommen weil sie dich respektieren, bleiben. Menschen die unter Druck eingestiegen sind, gehen beim ersten Gegenwind." },
];

export default function Schulung() {
  const [activeProfile, setActiveProfile] = useState("feuer");
  const [activeAsp, setActiveAsp] = useState({});
  const [openSection, setOpenSection] = useState("grundlage");

  const profile = PROFILES.find(p => p.id === activeProfile);
  const aspId = activeAsp[activeProfile] || "freiheit";
  const asp = profile?.aspirations.find(a => a.id === aspId);

  const navBtn = (id, label) => ({
    padding: "10px 18px", borderRadius: "10px 10px 0 0",
    fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none",
    background: openSection === id ? C.page : "transparent",
    color: openSection === id ? C.gold : C.mid,
    fontFamily: "Georgia, serif",
  });

  const profileTabStyle = (id) => {
    const p = PROFILES.find(x => x.id === id);
    return {
      padding: "8px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600,
      cursor: "pointer", border: `2px solid ${p?.color}`,
      background: activeProfile === id ? p?.color : "transparent",
      color: activeProfile === id ? C.white : p?.color,
      fontFamily: "Georgia, serif",
    };
  };

  const aspTabStyle = (id) => ({
    padding: "7px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: `1px solid ${profile?.color}`,
    background: aspId === id ? profile?.color : "transparent",
    color: aspId === id ? C.white : profile?.color,
    fontFamily: "Georgia, serif",
  });

  const block = { background: C.page, borderRadius: 10, padding: "14px 16px" };
  const blockDark = { background: "#1A1A2E", borderRadius: 10, padding: "14px 16px", gridColumn: "1/-1" };
  const label11 = { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.light, marginBottom: 6, display: "block" };
  const text14 = { fontSize: 14, color: C.mid, lineHeight: 1.65 };

  return (
    <div style={{ fontFamily: "Georgia, serif", background: C.page, minHeight: "100vh", color: C.dark }}>

      {/* HERO */}
      <div style={{ background: "linear-gradient(135deg,#1A1A2E,#2A2A4E)", padding: "36px 24px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#E8C84A", marginBottom: 10 }}>Erfolgs-Code System · Internes Schulungsdokument</div>
        <div style={{ fontSize: "clamp(24px,4vw,38px)", color: "#F5F0E8", fontWeight: "bold", marginBottom: 8 }}>
          Erfolgs-Code <em style={{ color: "#E8C84A" }}>Schulung</em>
        </div>
        <div style={{ color: "rgba(245,240,232,0.55)", fontSize: 14, marginBottom: 20 }}>
          Erfolgs-Code Gesprächsleitfaden – alle 16 Profil-Kombinationen
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {PROFILES.map(p => (
            <span key={p.id} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(245,240,232,0.75)", fontSize: 13, padding: "5px 14px", borderRadius: 100 }}>
              {p.emoji} {p.name}
            </span>
          ))}
        </div>
      </div>

      {/* NAV */}
      <div style={{ display: "flex", gap: 4, padding: "16px 20px 0", borderBottom: "1px solid rgba(0,0,0,0.08)", background: C.white, overflowX: "auto" }}>
        {[["grundlage","🔬 Grundlage"],["regeln","⭐ Regeln"],["profile","👤 Profile"],["referenz","📋 Referenz"]].map(([id, label]) => (
          <button key={id} style={navBtn(id, label)} onClick={() => setOpenSection(id)}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* GRUNDLAGE */}
        {openSection === "grundlage" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: C.light, marginBottom: 8 }}>Wissenschaftliche Basis</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "clamp(22px,3vw,30px)", fontWeight: "bold", color: C.dark, marginBottom: 6 }}>Warum dieser Test funktioniert</div>
            <div style={{ height: 2, background: `linear-gradient(90deg,${C.gold},transparent)`, marginBottom: 24 }} />

            {/* Intro Box */}
            <div style={{ background: C.goldBg, border: `1px solid rgba(184,134,11,0.2)`, borderLeft: `4px solid ${C.gold}`, borderRadius: 12, padding: "20px 24px", marginBottom: 28, fontSize: 14, color: C.mid, lineHeight: 1.8 }}>
              Der Erfolgs-Code basiert nicht auf Intuition oder Erfindung. Er kombiniert drei der am besten erforschten Modelle der modernen Persönlichkeitspsychologie und Verhaltensforschung. Jede Frage, jedes Profil und jeder Gesprächsleitfaden hat eine nachvollziehbare wissenschaftliche Grundlage.
            </div>

            {/* Fundament 1 – DISC */}
            <div style={{ background: C.white, borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ background: C.fireBg, padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: "bold", color: C.fire, flexShrink: 0 }}>01</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Das DISC-Modell – William Moulton Marston (1928)</div>
                  <div style={{ fontSize: 13, color: C.light, marginTop: 2 }}>Fundament der vier Persönlichkeitsprofile</div>
                </div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.75, marginBottom: 14 }}>
                  William Moulton Marston, Harvard-Psychologe, entwickelte 1928 in seinem Werk <em>„Emotions of Normal People"</em> das DISC-Modell. Er beschrieb vier grundlegende Verhaltensdimensionen die bei jedem Menschen vorhanden sind – in unterschiedlicher Ausprägung:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { farbe: "🔥", typ: "Dominance (D)", profil: "Der Macher", desc: "Handlungsorientiert, direkt, ergebnisorientiert. Trifft schnelle Entscheidungen und übernimmt Führung." },
                    { farbe: "💨", typ: "Influence (I)", profil: "Der Netzwerker", desc: "Kommunikativ, enthusiastisch, menschenorientiert. Baut Beziehungen und begeistert andere." },
                    { farbe: "🌊", typ: "Steadiness (S)", profil: "Der Anker", desc: "Geduldig, loyal, harmonieorientiert. Stabil, verlässlich und teamorientiert." },
                    { farbe: "🪨", typ: "Conscientiousness (C)", profil: "Der Architekt", desc: "Analytisch, präzise, qualitätsorientiert. Denkt systematisch und handelt mit Bedacht." },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.page, borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 4 }}>{item.farbe} {item.typ} = {item.profil}</div>
                      <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: C.light, lineHeight: 1.65, fontStyle: "italic" }}>
                  Das DISC-Modell ist heute eines der meistgenutzten Persönlichkeitsmodelle weltweit. Es wird in über 40 Ländern eingesetzt, von Fortune-500-Unternehmen für Teambuilding genutzt und in der Führungskräfteentwicklung, HR und im Vertriebscoaching eingesetzt. Autoren wie Tobias Beck, John Maxwell und Brian Tracy haben es popularisiert.
                </p>
              </div>
            </div>

            {/* Fundament 2 – Motivationspsychologie */}
            <div style={{ background: C.white, borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ background: C.waterBg, padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: "bold", color: C.water, flexShrink: 0 }}>02</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Motivationspsychologie – Maslow & Deci/Ryan</div>
                  <div style={{ fontSize: 13, color: C.light, marginTop: 2 }}>Fundament der vier Aspirationen</div>
                </div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.75, marginBottom: 14 }}>
                  Die vier Aspirationen im Quiz – Freiheit, Wirkung, Sicherheit, Wachstum – basieren auf zwei der einflussreichsten Motivationstheorien der Psychologie:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {[
                    { title: "Abraham Maslow – Bedürfnishierarchie (1943)", desc: "Maslow zeigte dass menschliche Motivation in Ebenen organisiert ist: von Grundbedürfnissen über Sicherheit und soziale Zugehörigkeit bis hin zu Selbstverwirklichung. Die Aspiration Sicherheit entspricht der zweiten Ebene, Wirkung der sozialen Ebene, Wachstum der Selbstverwirklichungsebene." },
                    { title: "Deci & Ryan – Selbstbestimmungstheorie (1985)", desc: "Edward Deci und Richard Ryan identifizierten drei universelle psychologische Grundbedürfnisse: Autonomie (= Freiheit), Kompetenz (= Wachstum) und soziale Eingebundenheit (= Wirkung). Ihre Forschung belegt, dass Menschen dauerhaft nur dann motiviert sind, wenn diese drei Bedürfnisse erfüllt werden." },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.page, borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.65 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: C.light, lineHeight: 1.65, fontStyle: "italic" }}>
                  Die Kombination aus Persönlichkeitstyp (WIE jemand tickt) und Aspiration (WAS jemanden antreibt) ist deshalb so kraftvoll: Sie erklärt nicht nur das Verhalten eines Menschen, sondern auch seine tiefste Motivation. Genau das macht personalisierte Gespräche möglich.
                </p>
              </div>
            </div>

            {/* Fundament 3 – Barrieren */}
            <div style={{ background: C.white, borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ background: C.rockBg, padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: "bold", color: C.rock, flexShrink: 0 }}>03</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Verhaltensökonomie – Kahneman & Thaler</div>
                  <div style={{ fontSize: 13, color: C.light, marginTop: 2 }}>Fundament der Barrieren-Frage</div>
                </div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.75, marginBottom: 14 }}>
                  Die sechste Frage – „Was hält dich WIRKLICH davon ab?" – ist die psychologisch stärkste im gesamten Quiz. Sie basiert auf Erkenntnissen der Verhaltensökonomie:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {[
                    { title: "Daniel Kahneman – Nobelpreisträger, „Thinking Fast and Slow" (2011)", desc: "Kahneman zeigte, dass Menschen ihre wahren Hindernisse selten direkt benennen. Sie rationalisieren. Die direkte Konfrontation mit der eigenen Blockade – wie in Frage 6 – aktiviert das langsame, bewusste Denken (System 2) und erzeugt tiefe Selbsterkenntnis." },
                    { title: "Richard Thaler – Nobelpreisträger, „Nudge" (2008)", desc: "Thaler beschrieb wie das Formulieren einer Entscheidung als aktive Selbstaussage (Ich-Form) die Bereitschaft zur Veränderung erhöht. Menschen die ihre eigene Barriere benennen, sind psychologisch bereit diese zu überwinden." },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.page, borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.65 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: C.light, lineHeight: 1.65, fontStyle: "italic" }}>
                  Wenn ein Lead selbst sagt „mir fehlt das richtige System" – ist das kein Einwand mehr. Es ist eine Einladung. Genau das macht die Barrieren-Frage zum wertvollsten Lead-Qualifizierungsinstrument im gesamten Quiz.
                </p>
              </div>
            </div>

            {/* Forer Effekt Hinweis */}
            <div style={{ background: "#1A1A2E", borderRadius: 16, padding: "24px 28px", marginBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "#E8C84A", marginBottom: 12 }}>Wichtiger Hinweis für Berater</div>
              <p style={{ fontSize: 14, color: "rgba(245,240,232,0.75)", lineHeight: 1.8, marginBottom: 10 }}>
                Jedes Persönlichkeitsprofil aktiviert bewusst den sogenannten <strong style={{ color: "#E8C84A" }}>Forer-Effekt</strong> (Bertram Forer, 1948): Menschen finden sich in präzise klingenden Beschreibungen ihrer Persönlichkeit stark wieder – das erzeugt Vertrauen und Identifikation.
              </p>
              <p style={{ fontSize: 14, color: "rgba(245,240,232,0.75)", lineHeight: 1.8 }}>
                Das ist keine Manipulation – es ist die psychologische Grundlage dafür, dass sich Leads nach dem Quiz verstanden fühlen. Und wer sich verstanden fühlt, ist offen für ein Gespräch. Nutze das als Brücke – nicht als Trick.
              </p>
            </div>
          </div>
        )}

        {/* REGELN */}
        {openSection === "regeln" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: C.light, marginBottom: 8 }}>Grundlage</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "clamp(22px,3vw,30px)", fontWeight: "bold", color: C.dark, marginBottom: 6 }}>Die 5 goldenen Regeln</div>
            <div style={{ height: 2, background: `linear-gradient(90deg,${C.gold},transparent)`, marginBottom: 20 }} />
            <div style={{ background: C.goldBg, border: `1px solid rgba(184,134,11,0.2)`, borderLeft: `4px solid ${C.gold}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, fontSize: 14, color: C.mid, lineHeight: 1.7 }}>
              Wähle das Erfolgs-Code Profil des Leads (Feuer, Wind, Wasser, Fels), dann die Aspiration per Tab. Jede der 16 Kombinationen hat einen eigenen Gesprächsleitfaden.
            </div>
            {RULES.map((r, i) => (
              <div key={i} style={{ background: C.white, borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", marginBottom: 14, padding: "20px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 32, fontWeight: "bold", color: C.gold, lineHeight: 1, flexShrink: 0, minWidth: 40 }}>{r.nr}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 5 }}>{r.title}</div>
                  <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.65 }}>{r.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PROFILE */}
        {openSection === "profile" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: C.light, marginBottom: 8 }}>Persönlichkeitsprofile</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "clamp(22px,3vw,30px)", fontWeight: "bold", marginBottom: 6 }}>Profil wählen</div>
            <div style={{ height: 2, background: `linear-gradient(90deg,${profile?.color},transparent)`, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {PROFILES.map(p => (
                <button key={p.id} style={profileTabStyle(p.id)} onClick={() => { setActiveProfile(p.id); setActiveAsp(a => ({...a, [p.id]: "freiheit"})); }}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>

            <div style={{ background: C.white, borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "24px 28px 20px", background: profile?.bg, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: "bold", color: profile?.color, marginBottom: 3 }}>{profile?.emoji} {profile?.name}</div>
                <div style={{ fontSize: 15, color: profile?.color, opacity: 0.75, fontStyle: "italic" }}>{profile?.tagline}</div>
              </div>

              {/* Psychologie */}
              <div style={{ margin: "20px 28px", padding: "16px 20px", background: C.page, borderRadius: 10, borderLeft: `3px solid ${profile?.color}` }}>
                <div style={{ ...label11, color: C.light }}>Psychologie verstehen</div>
                <div style={text14}>{profile?.psychologie}</div>
              </div>

              {/* Stärken + Niemals */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "0 28px 20px" }}>
                <div style={{ background: C.page, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ ...label11, color: profile?.color }}>Stärken</div>
                  <ul style={{ paddingLeft: 18 }}>
                    {profile?.stärken.map((s, i) => <li key={i} style={{ fontSize: 13.5, color: C.mid, marginBottom: 3 }}>{s}</li>)}
                  </ul>
                </div>
                <div style={{ background: C.page, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ ...label11, color: "#C0392B" }}>Blinder Fleck</div>
                  <div style={text14}>{profile?.fleck}</div>
                  <div style={{ ...label11, color: "#C0392B", marginTop: 12 }}>Niemals tun</div>
                  <div style={text14}>{profile?.niemals}</div>
                </div>
              </div>

              {/* Aspiration Tabs */}
              <div style={{ padding: "16px 28px 0", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {profile?.aspirations.map(a => (
                  <button key={a.id} style={aspTabStyle(a.id)} onClick={() => setActiveAsp(prev => ({ ...prev, [activeProfile]: a.id }))}>
                    {a.emoji} {a.label}
                  </button>
                ))}
              </div>

              {/* Aspiration Content */}
              {asp && (
                <div style={{ padding: "20px 28px 28px" }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: profile?.color, marginBottom: 16 }}>{asp.emoji} {profile?.name} + {asp.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div style={block}><span style={label11}>Was ihn wirklich antreibt</span><div style={text14}>{asp.antrieb}</div></div>
                    <div style={block}><span style={label11}>Was er auf keinen Fall will</span><div style={text14}>{asp.nein}</div></div>
                    <div style={blockDark}>
                      <span style={{ ...label11, color: "#E8C84A" }}>Gesprächseinstieg</span>
                      <div style={{ fontSize: 15, color: "rgba(245,240,232,0.85)", lineHeight: 1.65, fontStyle: "italic" }}>{asp.opener}</div>
                    </div>
                    <div style={block}><span style={label11}>Gesprächsführung</span><div style={text14}>{asp.gespräch}</div></div>
                    <div style={block}><span style={label11}>Was ihn wirklich überzeugt</span><div style={text14}>{asp.überzeugt}</div></div>
                  </div>

                  <span style={label11}>Typische Einwände</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {asp.einwände.map((e, i) => (
                      <div key={i} style={{ background: C.page, borderRadius: 10, padding: "12px 16px" }}>
                        <div style={{ fontSize: 13.5, fontStyle: "italic", color: C.mid, marginBottom: 5 }}>"{e.q}"</div>
                        <div style={{ fontSize: 14, color: C.dark, fontWeight: 500 }}>→ {e.a}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.18)", borderRadius: 10, padding: "12px 16px" }}>
                    <span style={{ ...label11, color: "#C0392B" }}>🚩 Red Flag</span>
                    <div style={text14}>{asp.redflag}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* REFERENZ */}
        {openSection === "referenz" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: C.light, marginBottom: 8 }}>Schnell-Referenz</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "clamp(22px,3vw,30px)", fontWeight: "bold", marginBottom: 6 }}>Einwände auf einen Blick</div>
            <div style={{ height: 2, background: `linear-gradient(90deg,${C.gold},transparent)`, marginBottom: 24 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {[
                { emoji:"🔥", name:"Macher", color: C.fire, items:[["Keine Zeit","Genau deshalb. Wer dauerhaft keine Zeit hat, hat das falsche System."],["Klingt nach MLM","Lass mich den Unterschied in 5 Minuten zeigen."],["Zu riskant","Was wäre das Schlimmste? Lass uns das durchrechnen."]]},
                { emoji:"💨", name:"Netzwerker", color: C.wind, items:[["Will niemanden nerven","Du bietest an. Wer nein sagt, sagt nein."],["Brauche mehr Infos","Der beste Weg: ein echter Mensch aus dem Team."],["Nicht der Typ","Wer ist deiner Meinung nach der Typ dafür?"]]},
                { emoji:"🌊", name:"Anker", color: C.water, items:[["Muss nachdenken","Was brauchst du konkret um zu entscheiden?"],["Muss Partner fragen","Soll ich euch beiden kurz erklären?"],["Nicht der Typ","Was stellst du dir vor müsstest du tun?"]]},
                { emoji:"🪨", name:"Architekt", color: C.rock, items:[["Muss analysieren","Hier ist alles – was fehlt dir noch?"],["Versteckte Kosten?","Ich schlüssel alles auf. Keine Überraschungen."],["Zu simpel für mich","Was du siehst ist die Oberflächlichkeit."]]},
              ].map((q, qi) => (
                <div key={qi} style={{ background: C.white, borderRadius: 14, padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", borderTop: `3px solid ${q.color}`, border: `1px solid rgba(0,0,0,0.06)`, borderTopColor: q.color, borderTopWidth: 3 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: q.color }}>{q.emoji} {q.name}</div>
                  {q.items.map(([einwand, antwort], ii) => (
                    <div key={ii} style={{ fontSize: 13, color: C.mid, padding: "6px 0", borderBottom: ii < q.items.length-1 ? "1px solid rgba(0,0,0,0.05)" : "none", lineHeight: 1.5 }}>
                      <strong style={{ color: C.dark }}>"{einwand}"</strong><br />→ {antwort}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ background: "linear-gradient(135deg,#1A1A2E,#2A2A4E)", borderRadius: 16, padding: "36px 32px", textAlign: "center" }}>
              <span style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#E8C84A", marginBottom: 16, display: "block" }}>Die eine Frage die immer funktioniert</span>
              <div style={{ fontSize: "clamp(16px,2.5vw,22px)", fontStyle: "italic", color: "#F5F0E8", lineHeight: 1.5, marginBottom: 14 }}>
                "Was müsste sich für dich bewahrheiten, damit das eine gute Entscheidung wäre?"
              </div>
              <div style={{ fontSize: 14, color: "rgba(245,240,232,0.5)", maxWidth: 440, margin: "0 auto" }}>
                Diese eine Frage zeigt dir was jemanden wirklich hält – und gibt dir die Antwort die du brauchst.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
