(function () {
  function buildQuestions(copy) {
    const out = {};

    copy.questions.forEach(function (question, index) {
      const n = index + 1;
      out['q' + n + '_phase'] = question.phase;
      out['q' + n + '_text'] = question.text;
      out['q' + n + '_sub'] = question.sub;

      question.options.forEach(function (option) {
        const suffix = option.key;
        out['q' + n + '_opt_' + suffix + '_label'] = option.label;
        out['q' + n + '_opt_' + suffix + '_desc'] = option.desc;
      });
    });

    return out;
  }

  function buildProfiles(copy) {
    const out = {};

    Object.keys(copy.profiles).forEach(function (key) {
      const profile = copy.profiles[key];
      out['profile_' + key + '_code'] = profile.code;
      out['profile_' + key + '_name'] = profile.name;
      out['profile_' + key + '_animal'] = profile.animal;
      out['profile_' + key + '_tagline'] = profile.tagline;
      out['profile_' + key + '_shadow'] = profile.shadow;
      out['profile_' + key + '_str_1'] = profile.strengths[0];
      out['profile_' + key + '_str_2'] = profile.strengths[1];
      out['profile_' + key + '_str_3'] = profile.strengths[2];
      out['profile_' + key + '_str_4'] = profile.strengths[3];
      out['profile_' + key + '_fit_freedom'] = profile.fit.freedom;
      out['profile_' + key + '_fit_impact'] = profile.fit.impact;
      out['profile_' + key + '_fit_security'] = profile.fit.security;
      out['profile_' + key + '_fit_growth'] = profile.fit.growth;
      out['profile_' + key + '_cta_freedom'] = profile.cta.freedom;
      out['profile_' + key + '_cta_impact'] = profile.cta.impact;
      out['profile_' + key + '_cta_security'] = profile.cta.security;
      out['profile_' + key + '_cta_growth'] = profile.cta.growth;
    });

    return out;
  }

  function buildTranslations(copy) {
    const out = Object.assign({}, copy.static);
    Object.assign(out, buildQuestions(copy));
    Object.assign(out, buildProfiles(copy));
    return out;
  }

  const de = buildTranslations({
    static: {
      intro_badge: 'Erfolgscode Analyse · 4 Minuten',
      intro_h1_line1: 'Welcher Erfolgstyp',
      intro_h1_line2: 'steckt wirklich in dir?',
      intro_body:
        '6 ehrliche Fragen. Ein überraschend klares Bild, wie du wirklich tickst und welche Chancen zu deiner Persönlichkeit passen.',
      intro_type_1: 'Feuer',
      intro_type_2: 'Wind',
      intro_type_3: 'Wasser',
      intro_type_4: 'Fels',
      intro_cta: 'Meinen Code entdecken →',
      intro_disclaimer: 'Kein Verkaufsgespräch. Keine E-Mail erforderlich.',
      intro_legal_link: 'Impressum & Datenschutz',

      analyzing_badge: 'Auswertung',
      analyzing_h2: 'Dein Profil wird erstellt...',
      analyzing_step_1: 'Persönlichkeitsmuster werden analysiert...',
      analyzing_step_2: 'Stärken und Antriebskräfte werden erkannt...',
      analyzing_step_3: 'Business-Kompatibilität wird berechnet...',
      analyzing_step_4: 'Dein persönliches Profil wird erstellt...',
      analyzing_step_5: 'Fast fertig...',

      quiz_phase: 'Phase',
      quiz_question_label: 'Frage',
      quiz_btn_next: 'Weiter →',
      quiz_btn_submit: 'Auswertung starten →',

      result_badge: 'Dein Erfolgscode',
      result_element_label: 'Element',
      result_strengths_heading: 'Deine größten Stärken',
      result_shadow_heading: 'Dein blinder Fleck',
      result_cta_btn: 'Ja, ich will mehr erfahren →',
      result_restart_btn: 'Quiz neu starten',

      barrier_vehicle: 'ein funktionierendes System',
      barrier_community: 'das richtige Umfeld',
      barrier_confidence: 'einen sicheren ersten Schritt',
      barrier_opportunity: 'die passende Möglichkeit',

      asp_tag_freedom: 'Freiheit',
      asp_tag_impact: 'Wirkung',
      asp_tag_security: 'Sicherheit',
      asp_tag_growth: 'Wachstum',

      aspconf_badge: 'Dein Fokus',
      aspconf_freedom_label: 'Freiheit ist dein Kernantrieb',
      aspconf_freedom_desc:
        'Du willst selbst bestimmen, wann, wie und mit wem du arbeitest. Genau deshalb braucht es ein Modell, das nicht wieder neue Abhängigkeiten schafft.',
      aspconf_impact_label: 'Wirkung ist dein Kernantrieb',
      aspconf_impact_desc:
        'Dir geht es nicht nur um Geld. Du willst spüren, dass das, was du tust, bei anderen Menschen wirklich etwas bewegt.',
      aspconf_security_label: 'Sicherheit ist dein Kernantrieb',
      aspconf_security_desc:
        'Du suchst keinen unnötigen Nervenkitzel. Du willst eine echte Chance, aber mit einem klaren, stabilen Fundament.',
      aspconf_growth_label: 'Wachstum ist dein Kernantrieb',
      aspconf_growth_desc:
        'Du willst nicht stillstehen. Du suchst ein Umfeld, in dem du an dir wachsen und echte Fähigkeiten aufbauen kannst.',
      aspconf_btn: 'Weiter →',
      aspconf_footnote: 'Deine Antworten machen das Ergebnis deutlich persönlicher.',

      optin_badge: 'Fast geschafft',
      optin_h2_line1: 'Wo sollen wir deine',
      optin_h2_line2: 'Videos hinschicken?',
      optin_body:
        'Drei kurze Videos, speziell für deinen Typ. Kein Spam. Kein Verkaufsdruck. Nur echte Information.',
      optin_label_firstname: 'Vorname',
      optin_placeholder_firstname: 'Dein Vorname',
      optin_label_email: 'E-Mail-Adresse',
      optin_placeholder_email: 'deine@email.com',
      optin_btn_submit: 'Videos freischalten →',
      optin_btn_loading: 'Wird gesendet...',
      optin_btn_validating: 'E-Mail wird geprüft...',
      optin_email_error_format: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      optin_email_error_invalid:
        'Diese E-Mail-Adresse wirkt nicht zustellbar. Bitte prüfe sie kurz.',
      optin_privacy: 'Deine Daten werden vertraulich behandelt und nicht weitergegeben.',

      video_1_title: 'Teil 1: Einführung',
      video_1_sub: 'Lerne in den nächsten Minuten, worum es wirklich geht.',
      video_2_title: 'Teil 2: So funktioniert es',
      video_2_sub:
        'Die vollständige Erklärung, wie das Modell aufgebaut ist und was es von anderen unterscheidet.',
      video_3_title: 'Teil 3: Echte Erfahrungen',
      video_3_sub:
        'Menschen wie du, was sie erlebt haben und was sich in ihrem Leben verändert hat.',
      video_counter: 'Video',
      video_next_label: 'Als nächstes',
      video_btn_next: 'Weiter zu Schritt',
      video_btn_prev: '← Video nochmal ansehen',
      video_btn_final: 'Weiter zu Schritt 4 →',
      video_btn_locked: 'Weiter zum nächsten Schritt',
      video_hint_locked: 'Der Weiter-Button wird nach 75 % des Videos freigeschaltet.',
      video_hint_unlocked: 'Weiter freigeschaltet.',
      video_hint_recovery:
        'Wenn die Video-Erkennung hakt, kannst du das Video neu laden oder im Ausnahmefall manuell fortfahren.',
      video_error_title: 'Das Video konnte technisch nicht sauber erkannt werden.',
      video_error_body:
        'Normalerweise wird der Weiter-Button automatisch bei 75 % freigeschaltet. Wenn das gerade nicht passiert, lade das Video neu oder nutze den manuellen Fallback.',
      video_error_detail: 'Technischer Hinweis',
      video_error_reload: 'Video neu laden',
      video_error_unlock: 'Manuell fortfahren',

      final_badge: 'Du hast alle drei Videos gesehen',
      final_h2: 'Passt das zu dir?',
      final_body:
        'Wenn du einfach mal unverbindlich schauen willst, ob das wirklich zu dir passt, schreib direkt. Kein Pitch, kein Druck. Nur ein ehrliches Gespräch.',
      final_profile_label: 'Dein Profil',
      final_btn_whatsapp: 'Ja, ich will mehr erfahren',
      final_btn_later: 'Ich melde mich selbst, wenn ich bereit bin',
      final_footnote: 'Du wirst direkt per WhatsApp verbunden. Keine Warteschleife, kein Formular.',
      final_contact_prompt: 'Fragen? Schreib an',
      quicklink_whatsapp_prefix: 'Hallo, ',
      quicklink_whatsapp_suffix: ', ich habe eine Frage.',
      final_whatsapp_prefill:
        'Hallo! Ich habe gerade das Erfolgscode-Quiz gemacht und möchte mehr über die Möglichkeit erfahren.',
      final_closed_h2: 'Alles gut. Kein Druck.',
      final_closed_body: 'Wenn du irgendwann neugierig wirst, weißt du, wo du uns findest.',
      final_closed_restart: 'Quiz wiederholen',
      result_barrier_intro: 'Du hast selbst gesagt: Dir fehlt – „',
      result_barrier_outro: '“. Genau dafür haben wir etwas.',

      legal_modal_title: 'Impressum & Datenschutz',
      webhook_title: 'DE - Erfolgscode Quiz',
    },
    questions: [
      {
        phase: 'Persönlichkeit',
        text: 'Was treibt dich morgens wirklich aus dem Bett?',
        sub: 'Sei ehrlich. Nicht was du sagen solltest, sondern was wirklich stimmt.',
        options: [
          {
            key: 'r',
            label: 'Ziele & Fortschritt',
            desc: 'Ich habe ein Ziel vor Augen und will sehen, wie ich vorankomme.',
          },
          {
            key: 'y',
            label: 'Menschen & Begegnungen',
            desc: 'Ich freue mich auf die Menschen, die ich heute treffe oder spreche.',
          },
          {
            key: 'g',
            label: 'Struktur & Ruhe',
            desc: 'Ich weiß, was auf mich zukommt und das gibt mir Ruhe und Energie.',
          },
          {
            key: 'b',
            label: 'Tiefe & Herausforderung',
            desc: 'Ich habe eine Aufgabe, die mich wirklich fordert und interessiert.',
          },
        ],
      },
      {
        phase: 'Persönlichkeit',
        text: 'In einer Gruppe bist du meistens...',
        sub: 'Denk an echte Situationen. Im Team, in der Familie oder im Freundeskreis.',
        options: [
          {
            key: 'r',
            label: 'Der Richtungsgeber',
            desc: 'Derjenige, der den Überblick hat und die Richtung vorgibt.',
          },
          {
            key: 'y',
            label: 'Der Stimmungsmacher',
            desc: 'Derjenige, der für gute Stimmung sorgt und andere mitreißt.',
          },
          {
            key: 'g',
            label: 'Der Ruhepol',
            desc: 'Derjenige, der zuhört und dafür sorgt, dass sich alle wohlfühlen.',
          },
          {
            key: 'b',
            label: 'Der stille Beobachter',
            desc: 'Derjenige, der im Hintergrund analysiert, bevor er etwas sagt.',
          },
        ],
      },
      {
        phase: 'Persönlichkeit',
        text: 'Was bringt dich wirklich auf die Palme?',
        sub: 'Dein größter Frustrations-Trigger verrät, was dir am tiefsten wichtig ist.',
        options: [
          {
            key: 'r',
            label: 'Blockaden & Zögerer',
            desc: 'Wenn Dinge nicht vorankommen, weil jemand nicht entscheiden kann oder will.',
          },
          {
            key: 'y',
            label: 'Schlechte Energie',
            desc: 'Wenn die Stimmung kippt und negative Energie alles vergiftet.',
          },
          {
            key: 'b',
            label: 'Vermeidbare Fehler',
            desc: 'Wenn Fehler passieren, die einfach nicht hätten passieren müssen.',
          },
          {
            key: 'g',
            label: 'Sinnlose Prozesse',
            desc: 'Wenn ich etwas tun soll, das für mich keinen Sinn ergibt.',
          },
        ],
      },
      {
        phase: 'Leben & Ziele',
        text: 'Was ist dir bei deiner Arbeit am wichtigsten?',
        sub: 'Wenn du nur eines haben kannst, was darf unter keinen Umständen fehlen?',
        options: [
          {
            key: 'freedom',
            label: 'Freiheit',
            desc: 'Selbst bestimmen, wann, wie und wo ich arbeite, ohne Erlaubnis zu brauchen.',
          },
          {
            key: 'impact',
            label: 'Wirkung',
            desc: 'Das Gefühl, dass meine Arbeit bei anderen Menschen wirklich etwas bewegt.',
          },
          {
            key: 'security',
            label: 'Sicherheit',
            desc: 'Ein stabiles, verlässliches Einkommen, auf das ich mich jeden Monat verlassen kann.',
          },
          {
            key: 'growth',
            label: 'Wachstum',
            desc: 'Jeden Tag ein bisschen besser werden und neue Fähigkeiten aufbauen.',
          },
        ],
      },
      {
        phase: 'Leben & Ziele',
        text: 'Wie sieht dein ideales Leben in 3 Jahren aus?',
        sub: 'Schließ kurz die Augen. Was siehst du wirklich?',
        options: [
          {
            key: 'freedom',
            label: 'Finanziell frei',
            desc: 'Ich entscheide selbst über meine Zeit und mein Einkommen. Kein Chef, kein Limit.',
          },
          {
            key: 'impact',
            label: 'Sinn & Erlebnisse',
            desc: 'Ich helfe Menschen, erlebe die Welt und tue dabei etwas, das wirklich Sinn macht.',
          },
          {
            key: 'security',
            label: 'Ruhe & Familie',
            desc: 'Keine Geldsorgen, Zeit für die Menschen, die mir wichtig sind und ein ruhiges, stabiles Leben.',
          },
          {
            key: 'growth',
            label: 'Expertise & System',
            desc: 'Ich bin in meinem Bereich anerkannt und habe ein System, das ohne mich läuft.',
          },
        ],
      },
      {
        phase: 'Leben & Ziele',
        text: 'Was hält dich WIRKLICH davon ab, dieses Leben bereits heute zu leben?',
        sub: 'Ehrlichkeit hier bringt dich weiter als die vermeintlich richtige Antwort.',
        options: [
          {
            key: 'vehicle',
            label: 'Fehlendes System',
            desc: 'Ich habe den Willen, aber noch kein funktionierendes System, das mich dorthin bringt.',
          },
          {
            key: 'community',
            label: 'Fehlendes Umfeld',
            desc: 'Mir fehlen Menschen um mich herum, die mich täglich pushen und mitziehen.',
          },
          {
            key: 'confidence',
            label: 'Fehlende Sicherheit',
            desc: 'Ich bin unsicher und brauche einen klaren, risikoarmen ersten Schritt.',
          },
          {
            key: 'opportunity',
            label: 'Fehlende Möglichkeit',
            desc: 'Ich habe noch keine Möglichkeit gefunden, die wirklich zu mir und meinem Leben passt.',
          },
        ],
      },
    ],
    profiles: {
      r: {
        code: 'Typ A',
        name: 'Der Macher',
        animal: 'Feuer',
        tagline: 'Du bist geboren, um zu führen und nicht um zu folgen.',
        shadow:
          'Manchmal wirkt deine Energie auf andere ungeduldig, aber das ist nur Antrieb, der ein Ventil sucht.',
        strengths: [
          'Schnelle, klare Entscheidungskraft',
          'Konsequenter Weg von der Idee zur Umsetzung',
          'Natürliche Führungsstärke',
          'Selbstgetrieben und unabhängig',
        ],
        fit: {
          freedom:
            'Du brauchst kein 9-to-5. Du brauchst ein System, das so schnell skaliert wie du denkst. Kein Chef. Kein Deckel. Deine Regeln.',
          impact:
            'Wenn du Wirkung willst, brauchst du ein Modell, in dem deine Energie andere wirklich bewegt und nicht in endlosen Meetings verpufft.',
          security:
            'Auch wenn du stark nach vorne gehst, willst du ein Fundament, das trägt. Ein starkes System gibt dir genau diese Basis.',
          growth:
            'Du entwickelst dich am stärksten dort, wo du Verantwortung übernehmen, führen und Ergebnisse sehen kannst.',
        },
        cta: {
          freedom:
            'Du weißt bereits, was du willst. Die Frage ist nur noch: Hast du das richtige Vehikel dafür?',
          impact:
            'Deine Energie kann Menschen mitziehen. Entscheidend ist nur, ob du sie im richtigen Umfeld einsetzt.',
          security:
            'Du musst dich nicht klein machen, um Sicherheit zu bekommen. Du brauchst nur das richtige Modell.',
          growth:
            'Du brauchst keine Motivation von außen. Du brauchst ein Spielfeld, das groß genug für dich ist.',
        },
      },
      y: {
        code: 'Typ B',
        name: 'Der Netzwerker',
        animal: 'Wind',
        tagline: 'Deine Energie ist ansteckend und genau das ist dein unfairer Vorteil.',
        shadow:
          'Manchmal springst du von Idee zu Idee, aber das ist kein Fehler. Du brauchst nur den richtigen Rahmen.',
        strengths: [
          'Ansteckende Begeisterungsfähigkeit',
          'Vertrauen in kurzer Zeit aufbauen',
          'Verbindender Kitt in jedem Team',
          'Positive, mitreißende Ausstrahlung',
        ],
        fit: {
          freedom:
            'Du musst nicht in starren Strukturen festhängen. Du brauchst ein Umfeld, in dem du mit Menschen und Energie wachsen kannst.',
          impact:
            'Wenn du Wirkung willst, bist du am stärksten dort, wo echte Beziehungen wichtiger sind als starre Prozesse.',
          security:
            'Sicherheit entsteht für dich nicht nur durch Geld, sondern durch ein Umfeld, das trägt und Menschen, die mit dir gehen.',
          growth:
            'Du wächst dort am stärksten, wo du neue Menschen, neue Räume und neue Möglichkeiten erlebst.',
        },
        cta: {
          freedom:
            'Du musst nicht verkaufen. Du musst einfach du sein. Ein Business auf echten Verbindungen ist deine natürliche Heimat.',
          impact:
            'Die stärksten Teams entstehen nicht durch perfekte Strategie, sondern durch Menschen wie dich.',
          security:
            'Wenn das Umfeld stimmt, ziehst du mit Leichtigkeit Menschen und Möglichkeiten an.',
          growth:
            'Dein größtes Potenzial entfaltet sich dort, wo Begeisterung auf ein klares System trifft.',
        },
      },
      g: {
        code: 'Typ C',
        name: 'Der Anker',
        animal: 'Wasser',
        tagline: 'Du bist der Fels, auf den andere bauen und das ist seltener, als du denkst.',
        shadow:
          'Du neigst dazu, deine eigenen Bedürfnisse zurückzustellen, aber dein Wohlbefinden ist die Grundlage für alles andere.',
        strengths: [
          'Absolut verlässlich und wortgetreu',
          'Tiefes und dauerhaftes Vertrauen',
          'Ruhepol in schwierigen Situationen',
          'Ausgeglichen und konfliktfrei',
        ],
        fit: {
          freedom:
            'Du brauchst kein Rampenlicht. Du brauchst Stabilität plus echte Freiheit, ohne Chaos in dein Leben zu bringen.',
          impact:
            'Du veränderst Menschen nicht durch Lautstärke, sondern durch Konstanz, Vertrauen und echte Präsenz.',
          security:
            'Ein stabiles, tragfähiges Modell ist für dich wichtiger als Hype. Genau dort entfaltet sich deine Stärke.',
          growth:
            'Du wächst nicht über Druck, sondern über Sicherheit, Klarheit und ein Umfeld, das dir vertraut.',
        },
        cta: {
          freedom:
            'Du brauchst keine Show. Du brauchst ein Modell, das zu deinem Leben passt und dir dabei Luft lässt.',
          impact:
            'Teams, die wirklich lange durchhalten, werden von Menschen wie dir geprägt und zusammengehalten.',
          security: 'Deine Stärke liegt darin, Vertrauen aufzubauen, das auch morgen noch trägt.',
          growth:
            'Wenn du das richtige Umfeld hast, entwickelst du eine Tiefe, die andere selten erreichen.',
        },
      },
      b: {
        code: 'Typ D',
        name: 'Der Architekt',
        animal: 'Fels',
        tagline: 'Du siehst Muster, die andere völlig übersehen.',
        shadow:
          'Manchmal analysierst du zu lange, aber Präzision ist deine Superkraft und kein Hindernis.',
        strengths: [
          'Fundierte und durchdachte Entscheidungen',
          'Systemischer Blick mit Weitblick',
          'Konsequente Optimierung mit Präzision',
          'Intrinsisch motiviert und unabhängig',
        ],
        fit: {
          freedom:
            'Du brauchst kein Chaos und keine leeren Versprechen. Du brauchst ein System, das du verstehst und langfristig optimieren kannst.',
          impact:
            'Deine Wirkung entsteht dort, wo andere nur Oberfläche sehen und du echte Struktur hineinbringst.',
          security:
            'Sicherheit entsteht für dich über Klarheit, Logik und ein Modell, das nachvollziehbar funktioniert.',
          growth:
            'Du wächst am stärksten, wenn du ein System durchdringen, verbessern und meistern kannst.',
        },
        cta: {
          freedom:
            'Du brauchst keine Hektik. Du brauchst ein Vehikel, das Substanz hat und deiner Denkweise standhält.',
          impact:
            'Die besten Strukturen in einem Business werden von Menschen wie dir erschaffen und perfektioniert.',
          security: 'Wenn du etwas verstehst, kannst du es mit Ruhe und Präzision groß machen.',
          growth: 'Deine Stärke liegt darin, aus Möglichkeiten echte Systeme zu machen.',
        },
      },
    },
  });

  const it = buildTranslations({
    static: {
      intro_badge: 'Analisi del codice del successo · 4 minuti',
      intro_h1_line1: 'Che tipo di successo',
      intro_h1_line2: 'si nasconde davvero in te?',
      intro_body:
        '6 domande sincere. Un quadro sorprendentemente chiaro di come funzioni davvero e di quali opportunità si adattino alla tua personalità.',
      intro_type_1: 'Fuoco',
      intro_type_2: 'Vento',
      intro_type_3: 'Acqua',
      intro_type_4: 'Roccia',
      intro_cta: 'Scopri il mio codice →',
      intro_disclaimer: 'Nessuna vendita. Nessuna e-mail necessaria.',
      intro_legal_link: 'Note legali e privacy',

      analyzing_badge: 'Analisi',
      analyzing_h2: 'Stiamo creando il tuo profilo...',
      analyzing_step_1: 'Stiamo analizzando i tuoi schemi di personalità...',
      analyzing_step_2: 'Stiamo identificando punti di forza e spinte interiori...',
      analyzing_step_3: 'Stiamo calcolando la compatibilità business...',
      analyzing_step_4: 'Stiamo costruendo il tuo profilo personale...',
      analyzing_step_5: 'Quasi finito...',

      quiz_phase: 'Fase',
      quiz_question_label: 'Domanda',
      quiz_btn_next: 'Continua →',
      quiz_btn_submit: "Avvia l'analisi →",

      result_badge: 'Il tuo codice del successo',
      result_element_label: 'Elemento',
      result_strengths_heading: 'I tuoi principali punti di forza',
      result_shadow_heading: 'Il tuo punto cieco',
      result_cta_btn: 'Sì, voglio saperne di più →',
      result_restart_btn: 'Ricomincia il quiz',

      barrier_vehicle: 'un sistema che funziona',
      barrier_community: "l'ambiente giusto",
      barrier_confidence: 'un primo passo sicuro',
      barrier_opportunity: "l'opportunità giusta",

      asp_tag_freedom: 'Libertà',
      asp_tag_impact: 'Impatto',
      asp_tag_security: 'Sicurezza',
      asp_tag_growth: 'Crescita',

      aspconf_badge: 'Il tuo focus',
      aspconf_freedom_label: 'La libertà è il tuo motore',
      aspconf_freedom_desc:
        'Vuoi decidere da solo quando, come e con chi lavorare. Per questo hai bisogno di un modello che non crei nuove dipendenze.',
      aspconf_impact_label: "L'impatto è il tuo motore",
      aspconf_impact_desc:
        'Non ti interessa solo il denaro. Vuoi sentire che ciò che fai muove davvero qualcosa nelle persone.',
      aspconf_security_label: 'La sicurezza è il tuo motore',
      aspconf_security_desc:
        'Non cerchi adrenalina inutile. Vuoi una vera opportunità, ma con una base chiara e stabile.',
      aspconf_growth_label: 'La crescita è il tuo motore',
      aspconf_growth_desc:
        'Non vuoi restare fermo. Cerchi un ambiente in cui crescere e sviluppare competenze reali.',
      aspconf_btn: 'Continua →',
      aspconf_footnote: 'Le tue risposte rendono il risultato molto più personale.',

      optin_badge: 'Quasi fatto',
      optin_h2_line1: 'Dove possiamo inviarti i tuoi',
      optin_h2_line2: 'video?',
      optin_body:
        'Tre brevi video, pensati per il tuo tipo. Niente spam. Nessuna pressione. Solo informazioni reali.',
      optin_label_firstname: 'Nome',
      optin_placeholder_firstname: 'Il tuo nome',
      optin_label_email: 'Indirizzo e-mail',
      optin_placeholder_email: 'tua@email.com',
      optin_btn_submit: 'Sblocca i video →',
      optin_btn_loading: 'Invio in corso...',
      optin_btn_validating: 'Controllo e-mail...',
      optin_email_error_format: 'Inserisci un indirizzo e-mail valido.',
      optin_email_error_invalid:
        'Questo indirizzo e-mail sembra non essere raggiungibile. Controllalo un attimo.',
      optin_privacy: 'I tuoi dati saranno trattati in modo confidenziale e non verranno condivisi.',

      video_1_title: 'Parte 1: Introduzione',
      video_1_sub: 'Scopri nei prossimi minuti di cosa si tratta davvero.',
      video_2_title: 'Parte 2: Come funziona',
      video_2_sub:
        'La spiegazione completa di come è costruito il modello e di cosa lo rende diverso dagli altri.',
      video_3_title: 'Parte 3: Esperienze reali',
      video_3_sub: 'Persone come te, cosa hanno vissuto e cosa è cambiato nella loro vita.',
      video_counter: 'Video',
      video_next_label: 'Subito dopo',
      video_btn_next: 'Continua allo step',
      video_btn_prev: '← Rivedi il video',
      video_btn_final: 'Continua allo step 4 →',
      video_btn_locked: 'Continua allo step successivo',
      video_hint_locked: 'Il pulsante continua si sblocca dopo il 75% del video.',
      video_hint_unlocked: 'Ora puoi continuare.',
      video_hint_recovery:
        'Se il rilevamento del video si blocca, puoi ricaricare il video o, in via eccezionale, continuare manualmente.',
      video_error_title: "Il video non e' stato rilevato correttamente per un problema tecnico.",
      video_error_body:
        'Di norma il pulsante continua si sblocca automaticamente al 75%. Se ora non succede, ricarica il video oppure usa il fallback manuale.',
      video_error_detail: 'Dettaglio tecnico',
      video_error_reload: 'Ricarica video',
      video_error_unlock: 'Continua manualmente',

      final_badge: 'Hai visto tutti e tre i video',
      final_h2: 'Fa per te?',
      final_body:
        'Se vuoi semplicemente capire senza impegno se questo può davvero essere adatto a te, scrivi direttamente. Nessun pitch, nessuna pressione. Solo una conversazione sincera.',
      final_profile_label: 'Il tuo profilo',
      final_btn_whatsapp: 'Sì, voglio saperne di più',
      final_btn_later: 'Ti scriverò io quando sarò pronto',
      final_footnote: 'Verrai collegato direttamente su WhatsApp. Nessuna attesa, nessun modulo.',
      final_contact_prompt: 'Domande? Scrivi a',
      quicklink_whatsapp_prefix: 'Ciao ',
      quicklink_whatsapp_suffix: ', ho una domanda.',
      final_whatsapp_prefill:
        'Ciao! Ho appena fatto il quiz Codice del Successo e vorrei saperne di più su questa opportunità.',
      final_closed_h2: 'Va bene così. Nessuna pressione.',
      final_closed_body: 'Se un giorno ti verrà curiosità, saprai dove trovarci.',
      final_closed_restart: 'Ripeti il quiz',
      result_barrier_intro: 'Ce lo hai detto tu stesso: ti manca "',
      result_barrier_outro: '". Ed è esattamente per questo che abbiamo qualcosa per te.',

      legal_modal_title: 'Note legali e privacy',
      webhook_title: 'IT - Quiz Codice del Successo',
    },
    questions: [
      {
        phase: 'Personalità',
        text: 'Cosa ti fa davvero alzare dal letto la mattina?',
        sub: 'Sii onesto. Non quello che dovresti dire, ma quello che senti davvero.',
        options: [
          {
            key: 'r',
            label: 'Obiettivi e progresso',
            desc: 'Ho un obiettivo davanti a me e voglio vedere come avanzo.',
          },
          {
            key: 'y',
            label: 'Persone e incontri',
            desc: "Non vedo l'ora di incontrare o parlare con le persone di oggi.",
          },
          {
            key: 'g',
            label: 'Struttura e calma',
            desc: 'So cosa mi aspetta e questo mi dà tranquillità ed energia.',
          },
          {
            key: 'b',
            label: 'Profondità e sfida',
            desc: 'Ho un compito che mi stimola davvero e mi interessa.',
          },
        ],
      },
      {
        phase: 'Personalità',
        text: 'In un gruppo sei di solito...',
        sub: 'Pensa a situazioni reali. In team, in famiglia o tra amici.',
        options: [
          {
            key: 'r',
            label: 'Chi dà la direzione',
            desc: "Quello che ha la visione d'insieme e indica la direzione.",
          },
          {
            key: 'y',
            label: 'Chi crea il clima',
            desc: 'Quello che porta energia positiva e trascina gli altri.',
          },
          {
            key: 'g',
            label: 'Il punto di calma',
            desc: 'Quello che ascolta e fa sentire tutti a proprio agio.',
          },
          {
            key: 'b',
            label: "L'osservatore silenzioso",
            desc: 'Quello che analizza in silenzio prima di parlare.',
          },
        ],
      },
      {
        phase: 'Personalità',
        text: 'Cosa ti manda davvero fuori di testa?',
        sub: 'Il tuo più grande trigger di frustrazione rivela ciò che per te conta davvero in profondità.',
        options: [
          {
            key: 'r',
            label: 'Blocchi e indecisione',
            desc: 'Quando le cose non avanzano perché qualcuno non sa o non vuole decidere.',
          },
          {
            key: 'y',
            label: 'Energia negativa',
            desc: "Quando l'atmosfera si rovina e l'energia negativa contamina tutto.",
          },
          {
            key: 'b',
            label: 'Errori evitabili',
            desc: 'Quando succedono errori che si sarebbero potuti evitare.',
          },
          {
            key: 'g',
            label: 'Processi senza senso',
            desc: 'Quando devo fare qualcosa che per me non ha alcun senso.',
          },
        ],
      },
      {
        phase: 'Vita e obiettivi',
        text: 'Che cosa è più importante per te nel lavoro?',
        sub: 'Se potessi averne solo una, cosa non dovrebbe assolutamente mancare?',
        options: [
          {
            key: 'freedom',
            label: 'Libertà',
            desc: 'Decidere da solo quando, come e dove lavorare, senza chiedere permesso.',
          },
          {
            key: 'impact',
            label: 'Impatto',
            desc: 'Sentire che il mio lavoro muove davvero qualcosa nelle altre persone.',
          },
          {
            key: 'security',
            label: 'Sicurezza',
            desc: 'Un reddito stabile e affidabile su cui poter contare ogni mese.',
          },
          {
            key: 'growth',
            label: 'Crescita',
            desc: 'Migliorare ogni giorno e costruire nuove competenze.',
          },
        ],
      },
      {
        phase: 'Vita e obiettivi',
        text: 'Come appare la tua vita ideale tra 3 anni?',
        sub: 'Chiudi gli occhi per un momento. Cosa vedi davvero?',
        options: [
          {
            key: 'freedom',
            label: 'Libero finanziariamente',
            desc: 'Decido io del mio tempo e del mio reddito. Nessun capo, nessun limite.',
          },
          {
            key: 'impact',
            label: 'Senso ed esperienze',
            desc: 'Aiuto le persone, vivo il mondo e faccio qualcosa che ha davvero significato.',
          },
          {
            key: 'security',
            label: 'Calma e famiglia',
            desc: 'Niente preoccupazioni economiche, tempo per le persone importanti e una vita stabile.',
          },
          {
            key: 'growth',
            label: 'Competenza e sistema',
            desc: 'Sono riconosciuto nel mio settore e ho un sistema che funziona anche senza di me.',
          },
        ],
      },
      {
        phase: 'Vita e obiettivi',
        text: 'Che cosa ti impedisce DAVVERO di vivere già oggi quella vita?',
        sub: 'Essere sincero qui ti porterà più lontano della risposta apparentemente giusta.',
        options: [
          {
            key: 'vehicle',
            label: 'Manca un sistema',
            desc: 'Ho la volontà, ma non ancora un sistema funzionante che mi ci porti.',
          },
          {
            key: 'community',
            label: "Manca l'ambiente",
            desc: 'Mi mancano persone intorno a me che mi spingano e mi sostengano ogni giorno.',
          },
          {
            key: 'confidence',
            label: 'Manca sicurezza',
            desc: 'Sono insicuro e ho bisogno di un primo passo chiaro e a basso rischio.',
          },
          {
            key: 'opportunity',
            label: "Manca l'opportunità",
            desc: 'Non ho ancora trovato una possibilità che si adatti davvero a me e alla mia vita.',
          },
        ],
      },
    ],
    profiles: {
      r: {
        code: 'Tipo A',
        name: 'Il realizzatore',
        animal: 'Fuoco',
        tagline: 'Sei nato per guidare, non per seguire.',
        shadow:
          'A volte la tua energia può sembrare impaziente agli altri, ma è solo spinta che cerca uno sbocco.',
        strengths: [
          'Decisioni rapide e chiare',
          "Passaggio coerente dall'idea all'azione",
          'Leadership naturale',
          'Autonomia e forte iniziativa',
        ],
        fit: {
          freedom:
            'Non hai bisogno di un 9-to-5. Hai bisogno di un sistema che cresca veloce quanto pensi tu.',
          impact:
            'Se vuoi lasciare un impatto, ti serve un modello in cui la tua energia muova davvero le persone.',
          security:
            'Anche se vai forte in avanti, vuoi una base solida. Un buon sistema ti dà proprio questo.',
          growth:
            'Ti sviluppi di più dove puoi assumerti responsabilità, guidare e vedere risultati.',
        },
        cta: {
          freedom: "Sai già cosa vuoi. L'unica domanda è: hai il veicolo giusto per arrivarci?",
          impact:
            'La tua energia può trascinare gli altri. Conta solo che sia incanalata nel contesto giusto.',
          security:
            'Non devi ridimensionarti per ottenere sicurezza. Ti serve solo il modello giusto.',
          growth:
            'Non ti serve motivazione esterna. Ti serve un campo da gioco abbastanza grande per te.',
        },
      },
      y: {
        code: 'Tipo B',
        name: 'Il connettore',
        animal: 'Vento',
        tagline: 'La tua energia è contagiosa e questo è il tuo vantaggio nascosto.',
        shadow:
          "A volte passi da un'idea all'altra, ma non è un difetto. Ti serve solo la struttura giusta.",
        strengths: [
          'Entusiasmo contagioso',
          'Costruisci fiducia molto in fretta',
          'Unisci e colleghi le persone',
          'Presenza positiva e coinvolgente',
        ],
        fit: {
          freedom:
            'Non sei fatto per strutture rigide. Dai il meglio in un ambiente dove persone ed energia possono crescere con te.',
          impact:
            'Se vuoi fare la differenza, sei fortissimo dove le relazioni contano più dei processi freddi.',
          security:
            'Per te la sicurezza non è solo denaro, ma anche un ambiente che sostiene e persone che camminano con te.',
          growth: 'Cresci di più quando incontri nuove persone, nuovi spazi e nuove possibilità.',
        },
        cta: {
          freedom:
            'Non devi vendere. Devi solo essere te stesso. Un business basato su relazioni vere è la tua casa naturale.',
          impact: 'I team più forti non nascono da strategie perfette, ma da persone come te.',
          security: "Quando l'ambiente è giusto, attrai persone e opportunità con naturalezza.",
          growth: 'Il tuo potenziale cresce davvero quando entusiasmo e sistema si incontrano.',
        },
      },
      g: {
        code: 'Tipo C',
        name: "L'ancora",
        animal: 'Acqua',
        tagline:
          'Sei il punto fermo su cui gli altri possono contare, ed è più raro di quanto pensi.',
        shadow:
          'Tendi a mettere i tuoi bisogni in secondo piano, ma il tuo benessere è la base di tutto.',
        strengths: [
          'Affidabilità assoluta',
          'Fiducia profonda e duratura',
          'Calma nelle situazioni difficili',
          'Equilibrio e assenza di conflitto',
        ],
        fit: {
          freedom:
            'Non hai bisogno dei riflettori. Hai bisogno di stabilità e libertà vera, senza portare caos nella tua vita.',
          impact: 'Non cambi le persone con il volume, ma con costanza, fiducia e presenza reale.',
          security:
            "Per te conta più una base solida che l'hype. È lì che la tua forza si esprime davvero.",
          growth:
            'Non cresci sotto pressione, ma con sicurezza, chiarezza e un ambiente che si fida di te.',
        },
        cta: {
          freedom:
            'Non ti serve spettacolo. Ti serve un modello che si adatti alla tua vita e ti dia respiro.',
          impact: 'I team che durano davvero sono modellati e tenuti insieme da persone come te.',
          security: 'La tua forza sta nel costruire una fiducia che regga anche domani.',
          growth: "Con l'ambiente giusto sviluppi una profondità che pochi riescono a raggiungere.",
        },
      },
      b: {
        code: 'Tipo D',
        name: "L'architetto",
        animal: 'Roccia',
        tagline: 'Vedi schemi che gli altri semplicemente non notano.',
        shadow:
          'A volte analizzi troppo a lungo, ma la precisione è il tuo superpotere, non un ostacolo.',
        strengths: [
          'Decisioni fondate e ragionate',
          'Visione sistemica e lungimirante',
          'Ottimizzazione coerente e precisa',
          'Motivazione interna e indipendenza',
        ],
        fit: {
          freedom:
            'Non ti servono caos o promesse vuote. Ti serve un sistema che puoi capire e migliorare nel tempo.',
          impact:
            'Il tuo impatto nasce dove gli altri vedono solo superficie e tu porti struttura reale.',
          security:
            'Per te la sicurezza nasce da chiarezza, logica e da un modello che funziona davvero.',
          growth: 'Cresci di più quando puoi comprendere, migliorare e padroneggiare un sistema.',
        },
        cta: {
          freedom:
            "Non hai bisogno di frenesia. Hai bisogno di un veicolo con sostanza, all'altezza del tuo modo di pensare.",
          impact:
            'Le migliori strutture in un business vengono create e perfezionate da persone come te.',
          security: 'Quando capisci qualcosa, puoi farla crescere con calma e precisione.',
          growth: 'La tua forza sta nel trasformare possibilità in sistemi reali.',
        },
      },
    },
  });

  const en = buildTranslations({
    static: {
      intro_badge: 'Success Code Analysis · 4 minutes',
      intro_h1_line1: 'What type of success',
      intro_h1_line2: 'is really inside you?',
      intro_body:
        '6 honest questions. A surprisingly clear picture of how you really work and which opportunities fit your personality.',
      intro_type_1: 'Fire',
      intro_type_2: 'Wind',
      intro_type_3: 'Water',
      intro_type_4: 'Stone',
      intro_cta: 'Discover my code →',
      intro_disclaimer: 'No sales call. No email required.',
      intro_legal_link: 'Legal notice & privacy',

      analyzing_badge: 'Analysis',
      analyzing_h2: 'Your profile is being created...',
      analyzing_step_1: 'Personality patterns are being analyzed...',
      analyzing_step_2: 'Strengths and drivers are being identified...',
      analyzing_step_3: 'Business compatibility is being calculated...',
      analyzing_step_4: 'Your personal profile is being created...',
      analyzing_step_5: 'Almost done...',

      quiz_phase: 'Phase',
      quiz_question_label: 'Question',
      quiz_btn_next: 'Continue →',
      quiz_btn_submit: 'Start analysis →',

      result_badge: 'Your success code',
      result_element_label: 'Element',
      result_strengths_heading: 'Your biggest strengths',
      result_shadow_heading: 'Your blind spot',
      result_cta_btn: 'Yes, I want to learn more →',
      result_restart_btn: 'Restart quiz',

      barrier_vehicle: 'a working system',
      barrier_community: 'the right environment',
      barrier_confidence: 'a safe first step',
      barrier_opportunity: 'the right opportunity',

      asp_tag_freedom: 'Freedom',
      asp_tag_impact: 'Impact',
      asp_tag_security: 'Security',
      asp_tag_growth: 'Growth',

      aspconf_badge: 'Your focus',
      aspconf_freedom_label: 'Freedom is your core driver',
      aspconf_freedom_desc:
        'You want to decide for yourself when, how and with whom you work. That is why you need a model that does not create new dependencies.',
      aspconf_impact_label: 'Impact is your core driver',
      aspconf_impact_desc:
        'It is not only about money for you. You want to feel that what you do truly moves something in other people.',
      aspconf_security_label: 'Security is your core driver',
      aspconf_security_desc:
        'You are not looking for unnecessary thrills. You want a real opportunity, but with a clear and stable foundation.',
      aspconf_growth_label: 'Growth is your core driver',
      aspconf_growth_desc:
        'You do not want to stand still. You are looking for an environment where you can grow and build real skills.',
      aspconf_btn: 'Continue →',
      aspconf_footnote: 'Your answers make the result much more personal.',

      optin_badge: 'Almost done',
      optin_h2_line1: 'Where should we send your',
      optin_h2_line2: 'videos?',
      optin_body:
        'Three short videos tailored to your type. No spam. No pressure. Just real information.',
      optin_label_firstname: 'First name',
      optin_placeholder_firstname: 'Your first name',
      optin_label_email: 'Email address',
      optin_placeholder_email: 'you@email.com',
      optin_btn_submit: 'Unlock the videos →',
      optin_btn_loading: 'Sending...',
      optin_btn_validating: 'Checking email...',
      optin_email_error_format: 'Please enter a valid email address.',
      optin_email_error_invalid:
        'This email address does not seem deliverable. Please double-check it.',
      optin_privacy: 'Your data will be treated confidentially and will not be shared.',

      video_1_title: 'Part 1: Introduction',
      video_1_sub: 'In the next few minutes, you will understand what this is really about.',
      video_2_title: 'Part 2: How it works',
      video_2_sub:
        'The full explanation of how the model is built and what makes it different from others.',
      video_3_title: 'Part 3: Real experiences',
      video_3_sub: 'People like you, what they experienced and what changed in their lives.',
      video_counter: 'Video',
      video_next_label: 'Up next',
      video_btn_next: 'Continue to step',
      video_btn_prev: '← Watch the video again',
      video_btn_final: 'Continue to step 4 →',
      video_btn_locked: 'Continue to the next step',
      video_hint_locked: 'The continue button unlocks after 75% of the video.',
      video_hint_unlocked: 'You can continue now.',
      video_hint_recovery:
        'If video detection gets stuck, you can reload the video or continue manually as an exception.',
      video_error_title: 'The video could not be detected properly due to a technical issue.',
      video_error_body:
        'Normally the continue button unlocks automatically at 75%. If that does not happen, reload the video or use the manual fallback.',
      video_error_detail: 'Technical detail',
      video_error_reload: 'Reload video',
      video_error_unlock: 'Continue manually',

      final_badge: 'You watched all three videos',
      final_h2: 'Does this fit you?',
      final_body:
        'If you simply want to explore without pressure whether this could really fit you, just write directly. No pitch, no pressure. Just an honest conversation.',
      final_profile_label: 'Your profile',
      final_btn_whatsapp: 'Yes, I want to learn more',
      final_btn_later: 'I will reach out when I am ready',
      final_footnote: 'You will be connected directly via WhatsApp. No waiting line, no form.',
      final_contact_prompt: 'Questions? Write to',
      quicklink_whatsapp_prefix: 'Hello ',
      quicklink_whatsapp_suffix: ', I have a question.',
      final_whatsapp_prefill:
        'Hello! I just completed the Success Code quiz and would like to learn more about this opportunity.',
      final_closed_h2: 'All good. No pressure.',
      final_closed_body: 'If you ever get curious later, you know where to find us.',
      final_closed_restart: 'Repeat quiz',
      result_barrier_intro: 'You said it yourself: what is missing is "',
      result_barrier_outro: '". That is exactly what we have for you.',

      legal_modal_title: 'Legal notice & privacy',
      webhook_title: 'EN - Success Code Quiz',
    },
    questions: [
      {
        phase: 'Personality',
        text: 'What really gets you out of bed in the morning?',
        sub: 'Be honest. Not what you should say, but what is actually true for you.',
        options: [
          {
            key: 'r',
            label: 'Goals & progress',
            desc: 'I have a goal in front of me and I want to see that I am moving forward.',
          },
          {
            key: 'y',
            label: 'People & connection',
            desc: 'I look forward to the people I will meet or talk to today.',
          },
          {
            key: 'g',
            label: 'Structure & calm',
            desc: 'I know what is coming and that gives me peace and energy.',
          },
          {
            key: 'b',
            label: 'Depth & challenge',
            desc: 'I have a task that really challenges and interests me.',
          },
        ],
      },
      {
        phase: 'Personality',
        text: 'In a group, you are usually...',
        sub: 'Think of real situations. In teams, family or your circle of friends.',
        options: [
          {
            key: 'r',
            label: 'The direction setter',
            desc: 'The one who has the overview and points the way.',
          },
          {
            key: 'y',
            label: 'The energizer',
            desc: 'The one who creates a good atmosphere and lifts others.',
          },
          {
            key: 'g',
            label: 'The calm center',
            desc: 'The one who listens and makes sure everyone feels comfortable.',
          },
          {
            key: 'b',
            label: 'The quiet observer',
            desc: 'The one who analyzes in the background before speaking.',
          },
        ],
      },
      {
        phase: 'Personality',
        text: 'What really gets on your nerves?',
        sub: 'Your biggest frustration trigger reveals what matters most to you deep down.',
        options: [
          {
            key: 'r',
            label: 'Blockers & hesitators',
            desc: 'When things do not move forward because someone cannot or will not decide.',
          },
          {
            key: 'y',
            label: 'Bad energy',
            desc: 'When the mood drops and negative energy poisons everything.',
          },
          {
            key: 'b',
            label: 'Avoidable mistakes',
            desc: 'When mistakes happen that simply should not have happened.',
          },
          {
            key: 'g',
            label: 'Pointless processes',
            desc: 'When I am told to do something that makes no sense to me.',
          },
        ],
      },
      {
        phase: 'Life & goals',
        text: 'What matters most to you in your work?',
        sub: 'If you could only have one thing, what must never be missing?',
        options: [
          {
            key: 'freedom',
            label: 'Freedom',
            desc: 'To decide when, how and where I work without needing permission.',
          },
          {
            key: 'impact',
            label: 'Impact',
            desc: 'The feeling that my work truly moves something in other people.',
          },
          {
            key: 'security',
            label: 'Security',
            desc: 'A stable and reliable income I can count on every month.',
          },
          {
            key: 'growth',
            label: 'Growth',
            desc: 'Getting a little better every day and building new skills.',
          },
        ],
      },
      {
        phase: 'Life & goals',
        text: 'What does your ideal life look like in 3 years?',
        sub: 'Close your eyes for a moment. What do you really see?',
        options: [
          {
            key: 'freedom',
            label: 'Financially free',
            desc: 'I decide over my time and income. No boss, no limit.',
          },
          {
            key: 'impact',
            label: 'Meaning & experiences',
            desc: 'I help people, experience the world and do something that truly matters.',
          },
          {
            key: 'security',
            label: 'Calm & family',
            desc: 'No money stress, time for the people who matter and a stable life.',
          },
          {
            key: 'growth',
            label: 'Expertise & system',
            desc: 'I am recognized in my field and I have a system that runs without me.',
          },
        ],
      },
      {
        phase: 'Life & goals',
        text: 'What is REALLY stopping you from living that life already today?',
        sub: 'Honesty here will help you more than the supposedly right answer.',
        options: [
          {
            key: 'vehicle',
            label: 'Missing system',
            desc: 'I have the will, but not yet a working system that gets me there.',
          },
          {
            key: 'community',
            label: 'Missing environment',
            desc: 'I am missing people around me who push and support me every day.',
          },
          {
            key: 'confidence',
            label: 'Missing certainty',
            desc: 'I feel unsure and I need a clear, low-risk first step.',
          },
          {
            key: 'opportunity',
            label: 'Missing opportunity',
            desc: 'I have not yet found an opportunity that truly fits me and my life.',
          },
        ],
      },
    ],
    profiles: {
      r: {
        code: 'Type A',
        name: 'The doer',
        animal: 'Fire',
        tagline: 'You were born to lead, not to follow.',
        shadow:
          'Sometimes your energy can feel impatient to others, but it is simply drive looking for an outlet.',
        strengths: [
          'Fast and clear decision-making',
          'Consistent move from idea to execution',
          'Natural leadership',
          'Self-driven and independent',
        ],
        fit: {
          freedom: 'You do not need a 9-to-5. You need a system that scales as fast as you think.',
          impact: 'If you want impact, you need a model where your energy truly moves people.',
          security:
            'Even if you move fast, you still want a strong foundation. A good system gives you exactly that.',
          growth: 'You grow most where you can take ownership, lead and see real results.',
        },
        cta: {
          freedom:
            'You already know what you want. The only question is: do you have the right vehicle?',
          impact:
            'Your energy can pull others forward. What matters is placing it in the right environment.',
          security:
            'You do not have to play small in order to feel secure. You just need the right model.',
          growth:
            'You do not need outside motivation. You need a field big enough for your potential.',
        },
      },
      y: {
        code: 'Type B',
        name: 'The connector',
        animal: 'Wind',
        tagline: 'Your energy is contagious and that is your unfair advantage.',
        shadow:
          'Sometimes you jump from one idea to the next, but that is not a flaw. You just need the right framework.',
        strengths: [
          'Contagious enthusiasm',
          'Builds trust very quickly',
          'Connects and energizes people',
          'Positive and magnetic presence',
        ],
        fit: {
          freedom:
            'You are not built for rigid structures. You thrive where people and energy can grow with you.',
          impact:
            'If you want impact, you are strongest where relationships matter more than cold processes.',
          security:
            'For you, security is not just money, but also an environment that supports you.',
          growth: 'You grow most when you encounter new people, new spaces and new possibilities.',
        },
        cta: {
          freedom:
            'You do not need to sell. You just need to be yourself. A business built on real connection is your natural home.',
          impact: 'The strongest teams are not built by perfect strategy, but by people like you.',
          security:
            'When the environment is right, you naturally attract people and opportunities.',
          growth: 'Your real potential expands when enthusiasm meets structure.',
        },
      },
      g: {
        code: 'Type C',
        name: 'The anchor',
        animal: 'Water',
        tagline: 'You are the steady point others can build on and that is rarer than you think.',
        shadow:
          'You tend to put your own needs second, but your well-being is the foundation for everything else.',
        strengths: [
          'Deep reliability',
          'Trust that lasts',
          'Calm in difficult situations',
          'Balanced and low-conflict',
        ],
        fit: {
          freedom:
            'You do not need the spotlight. You need stability plus real freedom without bringing chaos into your life.',
          impact:
            'You do not change people through volume, but through consistency, trust and real presence.',
          security:
            'A stable and sustainable model matters more to you than hype. That is where your strength shines.',
          growth:
            'You do not grow best under pressure, but through clarity, trust and a stable environment.',
        },
        cta: {
          freedom:
            'You do not need a show. You need a model that fits your life and gives you breathing room.',
          impact: 'Teams that truly last are shaped and held together by people like you.',
          security: 'Your strength is building trust that still holds tomorrow.',
          growth: 'With the right environment, you develop a depth that few people ever reach.',
        },
      },
      b: {
        code: 'Type D',
        name: 'The architect',
        animal: 'Stone',
        tagline: 'You see patterns that others completely miss.',
        shadow:
          'Sometimes you analyze for too long, but precision is your superpower, not your weakness.',
        strengths: [
          'Thoughtful and grounded decisions',
          'Systemic thinking with foresight',
          'Consistent optimization and precision',
          'Intrinsic drive and independence',
        ],
        fit: {
          freedom:
            'You do not need chaos or empty promises. You need a system you can understand and improve over time.',
          impact: 'Your impact begins where others see only surface and you bring real structure.',
          security: 'Security for you grows from clarity, logic and a model that truly works.',
          growth: 'You grow most when you can understand, refine and master a system.',
        },
        cta: {
          freedom:
            'You do not need frenzy. You need a vehicle with substance that can stand up to your way of thinking.',
          impact: 'The best business structures are created and refined by people like you.',
          security: 'Once you understand something, you can scale it with calm and precision.',
          growth: 'Your strength lies in turning possibilities into real systems.',
        },
      },
    },
  });

  window.TRANSLATIONS = {
    de: de,
    it: it,
    en: en,
  };
})();
