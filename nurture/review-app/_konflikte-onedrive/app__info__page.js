export default function InfoPage() {
  const phases = [
    {
      phase: 'Phase A — Aktivierung',
      color: '#7c3aed',
      bg: '#f5f3ff',
      border: '#c4b5fd',
      trigger: 'Lead registriert sich → hat noch kein Video geschaut (State 0)',
      note: 'A1 (Tag 0) wird von n8n / Postmark gesendet — nicht in Mautic. Nach A7 → Evergreen.',
      emails: [
        { id: '—', label: 'A1', when: 'Tag 0 (sofort)', variant: 'Single', condition: 'Immer', desc: 'Bestätigungsmail mit Erfolgscode + Video-Zugang. Wird von n8n/Postmark gesendet, nicht von Mautic.' },
        { id: '13–16', label: 'A2', when: 'Tag 2', variant: 'Aspiration (4×)', condition: 'Noch kein Video', desc: 'Aspiration-Story — macht den Wunsch lebendig. Freedom/Impact/Security/Growth Variante passend zum Quiz-Ergebnis.' },
        { id: '17–20', label: 'A3', when: 'Tag 5', variant: 'Barriere (4×)', condition: 'Noch kein Video', desc: 'Barriere direkt benennen — Lead fühlt sich verstanden. Vehicle/Community/Confidence/Opportunity Variante.' },
        { id: '21–24', label: 'A4', when: 'Tag 10', variant: 'Profil (4×)', condition: 'Noch kein Video', desc: 'Social Proof Story — jemand mit gleichem Typ hat es gemacht. Feuer/Wind/Wasser/Fels Variante.' },
        { id: '25', label: 'A5', when: 'Tag 21', variant: 'Single', condition: 'Noch kein Video', desc: 'Persönlicher Check-in vom Coach. Kurz, sehr menschlich.' },
        { id: '64–67', label: 'A6', when: 'Tag 30', variant: 'Profil (4×)', condition: 'Noch kein Video', desc: 'Profil-spezifische Ansprache — warum jetzt der richtige Zeitpunkt ist.' },
        { id: '68', label: 'A7', when: 'Tag 42', variant: 'Single', condition: 'Noch kein Video', desc: 'Letzte persönliche Einladung vor Evergreen. Ehrlich, kein Druck. Danach → Evergreen.' },
      ],
    },
    {
      phase: 'Phase B — Vertiefung nach Video 1',
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      trigger: '24h Inaktivität nach Video 1 (n8n liest aktuellen State aus Supabase → schickt genau EINE Email)',
      note: 'Wer V1+V2 in einer Session schaut bekommt direkt C1 — nicht B1+C1. Nach B6 → Evergreen.',
      emails: [
        { id: '26–29', label: 'B1', when: '24h nach V1', variant: 'Profil (4×)', condition: 'Kein V2 gesehen', desc: 'Momentum halten, open loop für V2. Typ-spezifischer Tease was Video 2 zeigt.' },
        { id: '30–33', label: 'B2', when: 'B+3 Tage', variant: 'Profil (4×)', condition: 'Immer noch kein V2', desc: 'Framework-Insight: warum dieses Modell für diesen Typ funktioniert. Tiefstes Verständnis für Fels.' },
        { id: '69–72', label: 'B3', when: 'B+7 Tage', variant: 'Profil (4×)', condition: 'Immer noch kein V2', desc: 'Vertiefende Profil-Email — geht tiefer auf den Typ-spezifischen Antrieb ein.' },
        { id: '73–76', label: 'B4', when: 'B+14 Tage', variant: 'Barriere (4×)', condition: 'Immer noch kein V2', desc: 'Barriere direkt adressieren — erklärt wie Video 2 genau diese Hürde löst.' },
        { id: '77', label: 'B5', when: 'B+21 Tage', variant: 'Single', condition: 'Immer noch kein V2', desc: 'Persönlicher Check-in — sehr kurz, sehr menschlich. Coach fragt was fehlt.' },
        { id: '78', label: 'B6', when: 'B+30 Tage', variant: 'Single', condition: 'Immer noch kein V2', desc: 'Letzte Einladung zu Video 2. Danach → Evergreen.' },
      ],
    },
    {
      phase: 'Phase C — Momentum nach Video 2',
      color: '#0891b2',
      bg: '#ecfeff',
      border: '#a5f3fc',
      trigger: '24h Inaktivität nach Video 2',
      note: 'Nach C6 → Evergreen.',
      emails: [
        { id: '34, 95–97', label: 'C1', when: '24h nach V2', variant: 'Aspiration (4×)', condition: 'Kein V3 gesehen', desc: 'Teil 3 als persönlichsten Wendepunkt positionieren. Aspiration-spezifischer Mittelsatz (Freedom/Impact/Security/Growth). Zitat: "Die ersten Teile haben gezeigt, dass es geht. Der dritte hat mir gezeigt, dass ICH es kann."' },
        { id: '35–38', label: 'C2', when: 'C+3 Tage', variant: 'Profil (4×)', condition: 'Immer noch kein V3', desc: '2–3 Kurzberichte passend zum Profil-Typ. Multi-Proof um letzte Hürde vor V3 zu nehmen.' },
        { id: '79–82', label: 'C3', when: 'C+7 Tage', variant: 'Profil (4×)', condition: 'Immer noch kein V3', desc: 'Vertiefende Profil-Email — fokussiert auf was Video 3 für diesen Typ bedeutet.' },
        { id: '83–86', label: 'C4', when: 'C+14 Tage', variant: 'Aspiration (4×)', condition: 'Immer noch kein V3', desc: 'Aspirations-Email — verbindet Video 3 mit dem persönlichen Wunsch des Leads.' },
        { id: '87', label: 'C5', when: 'C+21 Tage', variant: 'Single', condition: 'Immer noch kein V3', desc: 'Persönlicher Check-in. Sehr kurz, Coach fragt direkt.' },
        { id: '88', label: 'C6', when: 'C+30 Tage', variant: 'Single', condition: 'Immer noch kein V3', desc: 'Letzte Einladung zu Video 3. Danach → Evergreen.' },
      ],
    },
    {
      phase: 'Phase D — Conversion nach Video 3',
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fcd34d',
      trigger: '24h Inaktivität nach Video 3',
      note: 'Alle 3 Videos gesehen — jetzt geht es um das Infogespräch. Nach D6 → Evergreen. Kein Auto-Stopp bei CTA-Klick.',
      emails: [
        { id: '39–42', label: 'D1', when: '24h nach V3', variant: 'Aspiration (4×)', condition: 'Kein CTA geklickt', desc: 'Direkte Entscheidungs-Email. Reise zusammenfassen ("Du hast alle 3 Videos gesehen..."). CTA: Infogespräch mit Coach direkt.' },
        { id: '43–46', label: 'D2', when: 'D+3 Tage', variant: 'Barriere (4×)', condition: 'Immer noch kein CTA', desc: 'Einwand-Email. Barriere direkt in Betreffzeile ("Das kostet zu viel... wirklich?"). Spezifischer Proof per Barrieren-Typ.' },
        { id: '47', label: 'D3', when: 'D+7 Tage', variant: 'Single', condition: 'Immer noch kein CTA', desc: 'Persönliche Einladung zum Gespräch. Kein Druck, menschlich.' },
        { id: '89–92', label: 'D4', when: 'D+14 Tage', variant: 'Profil (4×)', condition: 'Immer noch kein CTA', desc: 'Profil-spezifische Gesprächseinladung — geht auf den Typ-spezifischen Antrieb ein.' },
        { id: '93', label: 'D5', when: 'D+21 Tage', variant: 'Single', condition: 'Immer noch kein CTA', desc: 'Direkte kurze Email: die die es gemacht haben wissen es.' },
        { id: '94', label: 'D6', when: 'D+30 Tage', variant: 'Single', condition: 'Immer noch kein CTA', desc: 'Letzte persönliche Nachricht. Ehrlich, kein Druck. Danach → Evergreen.' },
      ],
    },
    {
      phase: 'E1 — Post-CTA ⛔ DEAKTIVIERT',
      color: '#9ca3af',
      bg: '#f9fafb',
      border: '#e5e7eb',
      trigger: '— (deaktiviert)',
      note: 'Kampagne 22 ist deaktiviert. CTA-Klick stoppt KEINE laufenden Sequenzen mehr. Leads laufen weiter durch Phase D und danach in Evergreen.',
      deactivated: true,
      emails: [
        { id: '48', label: 'E1', when: '⛔ nie', variant: 'Single', condition: 'DEAKTIVIERT', desc: 'War: Bestätigungs-Email nach CTA-Klick. Deaktiviert — Email bleibt in Mautic erhalten aber wird nicht gesendet.' },
      ],
    },
    {
      phase: 'Evergreen — Forever Follow-Up',
      color: '#059669',
      bg: '#f0fdf4',
      border: '#6ee7b7',
      trigger: 'Startet nach jeder Aktivierungsphase (A7 / B6 / C6 / D6) wenn kein manueller Stopp — läuft monatlich, unbegrenzt',
      note: 'Stopp NUR durch: Unsubscribe-Link OR Coach setzt ac_nurture_stopped=true (CRM-Checkbox). Nie auto-stop. Emails wiederholen sich NIE — nach EV12 kommen neue Inhalte.',
      emails: [
        { id: '49', label: 'EV1', when: 'Monat 1', variant: 'Single', condition: 'Kein Stopp', desc: 'Value/Insight — nützlicher Business-Tipp passend zum Typ. Kein Verkauf.' },
        { id: '50', label: 'EV2', when: 'Monat 2', variant: 'Single', condition: '', desc: 'Social Proof — neue Erfolgsgeschichte (Typ-matching). Neue Person, neue Story.' },
        { id: '51', label: 'EV3', when: 'Monat 3', variant: 'Single', condition: '', desc: 'Soft Offer — "Falls du nochmal reinschauen möchtest" — Video-Link wieder anbieten.' },
        { id: '52', label: 'EV4', when: 'Monat 4', variant: 'Single', condition: '', desc: 'Personal Story — Coach-Story oder Team-Story. Neue Lektion jedes Mal.' },
        { id: '53', label: 'EV5', when: 'Monat 5', variant: 'Single', condition: '', desc: 'Re-Engagement — "Seit wir zuletzt gesprochen haben, ist folgendes passiert..."' },
        { id: '54–60', label: 'EV6–12', when: 'Monat 6–12', variant: 'Single', condition: '', desc: 'Zyklus (Value → Proof → Offer → Story → Re-Engagement) mit neuen Inhalten. Niemals dieselbe Email zweimal. Nach EV12 folgen neue Inhalte.' },
      ],
    },
    {
      phase: 'Reactivation — Nach Evergreen-Klick',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fca5a5',
      trigger: 'Lead klickt einen Link in einer Evergreen-Email (Mautic Webhook → n8n)',
      note: 'Nach der Sequenz: zurück in Evergreen bei EV-Position+1 (keine Email wird übersprungen)',
      emails: [
        { id: '61', label: 'Reactivation 1', when: 'Sofort', variant: 'Single', condition: 'Nach Evergreen-Klick', desc: '"Schön dass du wieder da bist" — was seit damals neu ist. Sofortige Reaktion auf das Signal.' },
        { id: '62', label: 'Reactivation 2', when: '+2 Tage', variant: 'Single', condition: '', desc: 'Neue Erfolgsgeschichte (Typ-matching). Bestätigt dass Bewegung im Markt ist.' },
        { id: '63', label: 'Reactivation 3', when: '+4 Tage', variant: 'Single', condition: '', desc: 'Direkter CTA — Infogespräch mit Coach. Kurze, intensive Einladung.' },
      ],
    },
  ]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#111827', color: '#fff', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span style={{ fontWeight: 700, fontSize: '16px' }}>✉ Email Review</span>
        <a href="/" style={{ color: '#9ca3af', fontSize: '13px', textDecoration: 'none' }}>← Zurück zur Email-Übersicht</a>
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: '12px' }}>84 Templates · 7 Phasen · 6 Emails pro Aktivierungsphase</span>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>Sequenz-Übersicht: Wann wird welche Email gesendet?</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 32px 0' }}>
          Das System versendet automatisch die richtige Email-Variante basierend auf Persönlichkeitstyp (Feuer/Wind/Wasser/Fels), Aspiration (Freedom/Impact/Security/Growth) und Barriere (Vehicle/Community/Confidence/Opportunity).
          Trigger kommen aus Supabase (Video-Fortschritt) und Mautic (Kampagnen-Timing).
        </p>

        {/* Flow summary */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px 24px', marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kompletter Flow auf einen Blick</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
            {[
              ['#111827', 'A1 Tag 0'],['#7c3aed','A2–A7 Tag 2–42'],
              ['#9ca3af','→'],
              ['#2563eb','B1–B6 24h/V1 bis +30T'],
              ['#9ca3af','→'],
              ['#0891b2','C1–C6 24h/V2 bis +30T'],
              ['#9ca3af','→'],
              ['#d97706','D1–D6 24h/V3 bis +30T'],
              ['#9ca3af','→'],
              ['#059669','EV1…EV12+ monatlich'],
            ].map(([color, label], i) =>
              color === '#9ca3af'
                ? <span key={i} style={{ color: '#9ca3af', fontSize: '14px' }}>{label}</span>
                : <span key={i} style={{ background: color, color: '#fff', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>{label}</span>
            )}
          </div>
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef3c7', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
            <strong>Wichtige Logik:</strong> Der n8n Inactivity-Checker läuft alle 2 Stunden. Er liest den <em>aktuellen</em> State aus Supabase — sendet immer nur die passende Phase-Email, nie mehrere.
            Wer V1+V2 in einer Session schaut bekommt direkt C1, nicht B1+C1. <strong>CTA-Klick stoppt keine Sequenzen</strong> — Leads laufen weiter bis Evergreen.
          </div>
        </div>

        {phases.map((p) => (
          <div key={p.phase} style={{ marginBottom: '28px', background: '#fff', border: `1px solid ${p.border}`, borderRadius: '10px', overflow: 'hidden', opacity: p.deactivated ? 0.65 : 1 }}>
            {/* Phase header */}
            <div style={{ background: p.bg, borderBottom: `1px solid ${p.border}`, padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: p.color }}>{p.phase}</span>
                <span style={{ fontSize: '12px', color: '#374151' }}>Trigger: {p.trigger}</span>
              </div>
              {p.note && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>ℹ {p.note}</div>
              )}
            </div>

            {/* Email rows */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                  {['Mautic ID', 'Email', 'Zeitpunkt', 'Variante', 'Bedingung', 'Inhalt'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.emails.map((e, i) => (
                  <tr key={i} style={{ borderBottom: i < p.emails.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11px' }}>#{e.id}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: p.color, color: '#fff', borderRadius: '4px', padding: '2px 8px', fontWeight: 700, fontSize: '12px' }}>{e.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{e.when}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{e.variant}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: '12px', whiteSpace: 'nowrap' }}>{e.condition || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#374151', fontSize: '12px', lineHeight: '1.5' }}>{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Footer note */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px 24px', fontSize: '13px', color: '#374151' }}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>Technische Architektur</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              ['Mautic', 'Email-Versand, Kampagnen-Timing, Segmente, Unsubscribe-Handling'],
              ['Supabase', 'Video-Fortschritt (video_1/2/3_watched_at), lifecycle_stage, Source of Truth für Business-State'],
              ['n8n – Inactivity Checker', 'Cron alle 2h. Liest Supabase, erkennt 24h Inaktivität, fügt Lead in Mautic-Segment ein'],
              ['n8n – Evergreen Scheduler', 'Täglich 08:00. Liest ac_evergreen_position, sendet nächste EV-Email, erhöht Position +1'],
              ['n8n – Reactivation Trigger', 'Webhook von Mautic bei Email-Klick. Startet 3-Email Reactivation-Sequenz'],
              ['n8n – Nightly Data Sync', 'Täglich 02:00. MySQL Coach-Daten → Mautic Custom Fields (Name, Email, WhatsApp, Slug)'],
            ].map(([title, desc]) => (
              <div key={title} style={{ background: '#f9fafb', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#111827', marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
