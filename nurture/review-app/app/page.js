'use client'

import { useState, useEffect, useCallback } from 'react'
import { html as beautifyHtml } from 'js-beautify'

const BEAUTIFY_OPTS = {
  indent_size: 2,
  wrap_line_length: 120,
  preserve_newlines: false,
  max_preserve_newlines: 1,
  unformatted: ['script', 'style'],
  content_unformatted: [],
  extra_liners: [],
  indent_inner_html: true,
}

const PROFILE_LABELS = { feuer: 'Der Macher', wind: 'Der Netzwerker', wasser: 'Der Anker', fels: 'Der Architekt' }
const ASPIRATION_LABELS = { freedom: 'Freiheit', impact: 'Wirkung', security: 'Sicherheit', growth: 'Wachstum' }
const PROFILE_LABELS_IT = { feuer: 'Il Motore', wind: 'Il Networker', wasser: "L'Ancora", fels: "L'Architetto" }
const ASPIRATION_LABELS_IT = { freedom: 'Libertà', impact: 'Impatto', security: 'Sicurezza', growth: 'Crescita' }
const PROFILE_LABELS_EN = { feuer: 'The Doer', wind: 'The Connector', wasser: 'The Anchor', fels: 'The Architect' }
const ASPIRATION_LABELS_EN = { freedom: 'Freedom', impact: 'Impact', security: 'Security', growth: 'Growth' }
const IT_EMAIL_IDS = new Set(Array.from({ length: 32 }, (_, i) => i + 98))
const EN_EMAIL_IDS = new Set(Array.from({ length: 32 }, (_, i) => i + 130))

function substituteTokens(html, profile, aspiration, selectedId) {
  if (!html) return html
  const isItalian = IT_EMAIL_IDS.has(selectedId)
  const isEnglish = EN_EMAIL_IDS.has(selectedId)
  const profileLabels = isItalian ? PROFILE_LABELS_IT : (isEnglish ? PROFILE_LABELS_EN : PROFILE_LABELS)
  const aspirationLabels = isItalian ? ASPIRATION_LABELS_IT : (isEnglish ? ASPIRATION_LABELS_EN : ASPIRATION_LABELS)
  const profileLabel = profileLabels[profile] || (isItalian ? 'Il Motore' : (isEnglish ? 'The Doer' : 'Der Macher'))
  const goalLabel = aspirationLabels[aspiration] || (isItalian ? 'Libertà' : (isEnglish ? 'Freedom' : 'Freiheit'))
  return html
    .replace(/\{contactfield=firstname\}/g, 'Hansi')
    .replace(/\{contactfield=ac_berater_vorname\}/g, 'Markus')
    .replace(/\{contactfield=ac_berater_name\}/g, 'Oberhofer')
    .replace(/\{contactfield=ac_berater_email\}/g, 'markus@global-sce.com')
    .replace(/\{contactfield=ac_berater_whatsapp\}/g, '+43 660 1234567')
    .replace(/\{contactfield=ac_berater_slug\}/g, 'markus')
    .replace(/\{contactfield=ac_last_video_access_url\}/g, 'https://business.activecenter.info/markus?r=preview')
    .replace(/\{contactfield=ac_last_profile_label\}/g, profileLabel)
    .replace(/\{contactfield=ac_last_main_goal_label\}/g, goalLabel)
    .replace(/\{unsubscribe_url\}/g, '#abmelden')
    .replace(/\{contactfield=[^}]+\}/g, (m) => `<span style="background:#fef3c7;color:#92400e;padding:0 3px;border-radius:3px;font-size:11px;">${m}</span>`)
}

const GROUPS = [
  { key: 'a2', label: 'A2 – Aspiration', phase: 'Phase A', dim: 'aspiration',
    emails: [{id:13,label:'Freedom',key:'freedom'},{id:14,label:'Impact',key:'impact'},{id:15,label:'Security',key:'security'},{id:16,label:'Growth',key:'growth'}] },
  { key: 'a3', label: 'A3 – Barrier', phase: 'Phase A', dim: 'barrier',
    emails: [{id:17,label:'Vehicle',key:'vehicle'},{id:18,label:'Community',key:'community'},{id:19,label:'Confidence',key:'confidence'},{id:20,label:'Opportunity',key:'opportunity'}] },
  { key: 'a4', label: 'A4 – Profil', phase: 'Phase A', dim: 'profile',
    emails: [{id:21,label:'Macher 🔥',key:'feuer'},{id:22,label:'Netzwerker 💨',key:'wind'},{id:23,label:'Anker 💧',key:'wasser'},{id:24,label:'Architekt 🪨',key:'fels'}] },
  { key: 'a5', label: 'A5 – Check-in', phase: 'Phase A', dim: 'none',
    emails: [{id:25,label:'Check-in',key:'s'}] },
  { key: 'a6', label: 'A6 – Profil', phase: 'Phase A', dim: 'profile',
    emails: [{id:64,label:'Macher 🔥',key:'feuer'},{id:65,label:'Netzwerker 💨',key:'wind'},{id:66,label:'Anker 💧',key:'wasser'},{id:67,label:'Architekt 🪨',key:'fels'}] },
  { key: 'a7', label: 'A7 – Letzte Einladung', phase: 'Phase A', dim: 'none',
    emails: [{id:68,label:'Letzte Einladung',key:'s'}] },
  { key: 'b1', label: 'B1 – Profil', phase: 'Phase B', dim: 'profile',
    emails: [{id:26,label:'Macher 🔥',key:'feuer'},{id:27,label:'Netzwerker 💨',key:'wind'},{id:28,label:'Anker 💧',key:'wasser'},{id:29,label:'Architekt 🪨',key:'fels'}] },
  { key: 'b2', label: 'B2 – Profil', phase: 'Phase B', dim: 'profile',
    emails: [{id:30,label:'Macher 🔥',key:'feuer'},{id:31,label:'Netzwerker 💨',key:'wind'},{id:32,label:'Anker 💧',key:'wasser'},{id:33,label:'Architekt 🪨',key:'fels'}] },
  { key: 'b3', label: 'B3 – Profil', phase: 'Phase B', dim: 'profile',
    emails: [{id:69,label:'Macher 🔥',key:'feuer'},{id:70,label:'Netzwerker 💨',key:'wind'},{id:71,label:'Anker 💧',key:'wasser'},{id:72,label:'Architekt 🪨',key:'fels'}] },
  { key: 'b4', label: 'B4 – Barrier', phase: 'Phase B', dim: 'barrier',
    emails: [{id:73,label:'Vehicle',key:'vehicle'},{id:74,label:'Community',key:'community'},{id:75,label:'Confidence',key:'confidence'},{id:76,label:'Opportunity',key:'opportunity'}] },
  { key: 'b5', label: 'B5 – Check-in', phase: 'Phase B', dim: 'none',
    emails: [{id:77,label:'Check-in',key:'s'}] },
  { key: 'b6', label: 'B6 – Letzte Einladung', phase: 'Phase B', dim: 'none',
    emails: [{id:78,label:'Letzte Einladung',key:'s'}] },
  { key: 'c1', label: 'C1 – Testimonials', phase: 'Phase C', dim: 'none',
    emails: [{id:34,label:'Testimonials',key:'s'}] },
  { key: 'c2', label: 'C2 – Profil', phase: 'Phase C', dim: 'profile',
    emails: [{id:35,label:'Macher 🔥',key:'feuer'},{id:36,label:'Netzwerker 💨',key:'wind'},{id:37,label:'Anker 💧',key:'wasser'},{id:38,label:'Architekt 🪨',key:'fels'}] },
  { key: 'c3', label: 'C3 – Profil', phase: 'Phase C', dim: 'profile',
    emails: [{id:79,label:'Macher 🔥',key:'feuer'},{id:80,label:'Netzwerker 💨',key:'wind'},{id:81,label:'Anker 💧',key:'wasser'},{id:82,label:'Architekt 🪨',key:'fels'}] },
  { key: 'c4', label: 'C4 – Aspiration', phase: 'Phase C', dim: 'aspiration',
    emails: [{id:83,label:'Freedom',key:'freedom'},{id:84,label:'Impact',key:'impact'},{id:85,label:'Security',key:'security'},{id:86,label:'Growth',key:'growth'}] },
  { key: 'c5', label: 'C5 – Check-in', phase: 'Phase C', dim: 'none',
    emails: [{id:87,label:'Check-in',key:'s'}] },
  { key: 'c6', label: 'C6 – Letzte Einladung', phase: 'Phase C', dim: 'none',
    emails: [{id:88,label:'Letzte Einladung',key:'s'}] },
  { key: 'd1', label: 'D1 – Aspiration', phase: 'Phase D', dim: 'aspiration',
    emails: [{id:39,label:'Freedom',key:'freedom'},{id:40,label:'Impact',key:'impact'},{id:41,label:'Security',key:'security'},{id:42,label:'Growth',key:'growth'}] },
  { key: 'it-a2', label: 'IT A2 - Aspirazione', phase: 'Italiano', dim: 'aspiration',
    emails: [{id:98,label:'Libertà',key:'freedom'},{id:99,label:'Impatto',key:'impact'},{id:100,label:'Sicurezza',key:'security'},{id:101,label:'Crescita',key:'growth'}] },
  { key: 'it-b1', label: 'IT B1 - Profilo', phase: 'Italiano', dim: 'profile',
    emails: [{id:102,label:'Motore',key:'feuer'},{id:103,label:'Networker',key:'wind'},{id:104,label:'Ancora',key:'wasser'},{id:105,label:'Architetto',key:'fels'}] },
  { key: 'it-c1', label: 'IT C1 - Esperienze', phase: 'Italiano', dim: 'aspiration',
    emails: [{id:106,label:'Libertà',key:'freedom'},{id:107,label:'Impatto',key:'impact'},{id:108,label:'Sicurezza',key:'security'},{id:109,label:'Crescita',key:'growth'}] },
  { key: 'it-d1', label: 'IT D1 - Decisione', phase: 'Italiano', dim: 'aspiration',
    emails: [{id:110,label:'Libertà',key:'freedom'},{id:111,label:'Impatto',key:'impact'},{id:112,label:'Sicurezza',key:'security'},{id:113,label:'Crescita',key:'growth'}] },
  { key: 'it-a3', label: 'IT A3 - Ostacolo', phase: 'Italiano', dim: 'barrier',
    emails: [{id:114,label:'Vehicle',key:'vehicle'},{id:115,label:'Community',key:'community'},{id:116,label:'Confidence',key:'confidence'},{id:117,label:'Opportunity',key:'opportunity'}] },
  { key: 'it-b2', label: 'IT B2 - Profilo', phase: 'Italiano', dim: 'profile',
    emails: [{id:118,label:'Motore',key:'feuer'},{id:119,label:'Networker',key:'wind'},{id:120,label:'Ancora',key:'wasser'},{id:121,label:'Architetto',key:'fels'}] },
  { key: 'it-c2', label: 'IT C2 - Profilo', phase: 'Italiano', dim: 'profile',
    emails: [{id:122,label:'Motore',key:'feuer'},{id:123,label:'Networker',key:'wind'},{id:124,label:'Ancora',key:'wasser'},{id:125,label:'Architetto',key:'fels'}] },
  { key: 'it-d2', label: 'IT D2 - Decisione', phase: 'Italiano', dim: 'barrier',
    emails: [{id:126,label:'Vehicle',key:'vehicle'},{id:127,label:'Community',key:'community'},{id:128,label:'Confidence',key:'confidence'},{id:129,label:'Opportunity',key:'opportunity'}] },
  { key: 'en-a2', label: 'EN A2 - Aspiration', phase: 'English', dim: 'aspiration',
    emails: [{id:146,label:'Freedom',key:'freedom'},{id:147,label:'Impact',key:'impact'},{id:148,label:'Security',key:'security'},{id:149,label:'Growth',key:'growth'}] },
  { key: 'en-a3', label: 'EN A3 - Barrier', phase: 'English', dim: 'barrier',
    emails: [{id:130,label:'Vehicle',key:'vehicle'},{id:131,label:'Community',key:'community'},{id:132,label:'Confidence',key:'confidence'},{id:133,label:'Opportunity',key:'opportunity'}] },
  { key: 'en-b1', label: 'EN B1 - Profile', phase: 'English', dim: 'profile',
    emails: [{id:150,label:'Doer',key:'feuer'},{id:151,label:'Connector',key:'wind'},{id:152,label:'Anchor',key:'wasser'},{id:153,label:'Architect',key:'fels'}] },
  { key: 'en-b2', label: 'EN B2 - Profile', phase: 'English', dim: 'profile',
    emails: [{id:134,label:'Doer',key:'feuer'},{id:135,label:'Connector',key:'wind'},{id:136,label:'Anchor',key:'wasser'},{id:137,label:'Architect',key:'fels'}] },
  { key: 'en-c1', label: 'EN C1 - Experiences', phase: 'English', dim: 'aspiration',
    emails: [{id:154,label:'Freedom',key:'freedom'},{id:155,label:'Impact',key:'impact'},{id:156,label:'Security',key:'security'},{id:157,label:'Growth',key:'growth'}] },
  { key: 'en-c2', label: 'EN C2 - Profile', phase: 'English', dim: 'profile',
    emails: [{id:138,label:'Doer',key:'feuer'},{id:139,label:'Connector',key:'wind'},{id:140,label:'Anchor',key:'wasser'},{id:141,label:'Architect',key:'fels'}] },
  { key: 'en-d1', label: 'EN D1 - Decision', phase: 'English', dim: 'aspiration',
    emails: [{id:158,label:'Freedom',key:'freedom'},{id:159,label:'Impact',key:'impact'},{id:160,label:'Security',key:'security'},{id:161,label:'Growth',key:'growth'}] },
  { key: 'en-d2', label: 'EN D2 - Decision', phase: 'English', dim: 'barrier',
    emails: [{id:142,label:'Vehicle',key:'vehicle'},{id:143,label:'Community',key:'community'},{id:144,label:'Confidence',key:'confidence'},{id:145,label:'Opportunity',key:'opportunity'}] },
  { key: 'd2', label: 'D2 – Barrier', phase: 'Phase D', dim: 'barrier',
    emails: [{id:43,label:'Vehicle',key:'vehicle'},{id:44,label:'Community',key:'community'},{id:45,label:'Confidence',key:'confidence'},{id:46,label:'Opportunity',key:'opportunity'}] },
  { key: 'd3', label: 'D3 – Profil', phase: 'Phase D', dim: 'none',
    emails: [{id:47,label:'Entscheidung',key:'s'}] },
  { key: 'd4', label: 'D4 – Profil', phase: 'Phase D', dim: 'profile',
    emails: [{id:89,label:'Macher 🔥',key:'feuer'},{id:90,label:'Netzwerker 💨',key:'wind'},{id:91,label:'Anker 💧',key:'wasser'},{id:92,label:'Architekt 🪨',key:'fels'}] },
  { key: 'd5', label: 'D5 – Direkt', phase: 'Phase D', dim: 'none',
    emails: [{id:93,label:'Direkt',key:'s'}] },
  { key: 'd6', label: 'D6 – Letzte Nachricht', phase: 'Phase D', dim: 'none',
    emails: [{id:94,label:'Letzte Nachricht',key:'s'}] },
  { key: 'e1', label: 'E1 – Post-CTA ⛔ deaktiviert', phase: 'Post-CTA', dim: 'none', deactivated: true,
    emails: [{id:48,label:'Confirmation',key:'s'}] },
  { key: 'ev', label: 'Evergreen EV1–12', phase: 'Evergreen', dim: 'none',
    emails: [{id:49,label:'EV1',key:'ev1'},{id:50,label:'EV2',key:'ev2'},{id:51,label:'EV3',key:'ev3'},{id:52,label:'EV4',key:'ev4'},{id:53,label:'EV5',key:'ev5'},{id:54,label:'EV6',key:'ev6'},{id:55,label:'EV7',key:'ev7'},{id:56,label:'EV8',key:'ev8'},{id:57,label:'EV9',key:'ev9'},{id:58,label:'EV10',key:'ev10'},{id:59,label:'EV11',key:'ev11'},{id:60,label:'EV12',key:'ev12'}] },
  { key: 'react', label: 'Reactivation', phase: 'Reactivation', dim: 'none',
    emails: [{id:61,label:'Welcome Back',key:'wb'},{id:62,label:'New Story',key:'ns'},{id:63,label:'Direct Invite',key:'di'}] },
]

const PHASE_COLORS = {
  'Phase A': '#7c3aed', 'Phase B': '#2563eb', 'Phase C': '#0891b2',
  'Phase D': '#d97706', 'Italiano': '#0f766e', 'English': '#2563eb', 'Post-CTA': '#16a34a', 'Evergreen': '#059669', 'Reactivation': '#dc2626',
}

function getFilteredList(profile, aspiration, barrier) {
  return GROUPS.flatMap(g => {
    if (g.dim === 'none') return g.emails
    if (g.dim === 'profile') return profile ? g.emails.filter(e => e.key === profile) : g.emails
    if (g.dim === 'aspiration') return aspiration ? g.emails.filter(e => e.key === aspiration) : g.emails
    if (g.dim === 'barrier') return barrier ? g.emails.filter(e => e.key === barrier) : g.emails
    return g.emails
  })
}

const S = {
  select: {
    background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151',
    borderRadius: '5px', padding: '5px 8px', fontSize: '12px', cursor: 'pointer',
  },
  navBtn: {
    padding: '5px 12px', background: '#f3f4f6', border: '1px solid #d1d5db',
    borderRadius: '5px', cursor: 'pointer', fontSize: '12px', color: '#374151',
    fontFamily: 'inherit',
  },
}

export default function EmailReview() {
  const [profile, setProfile] = useState('')
  const [aspiration, setAspiration] = useState('')
  const [barrier, setBarrier] = useState('')
  const filteredList = getFilteredList(profile, aspiration, barrier)

  const [selectedId, setSelectedId] = useState(13)
  const [rawHtml, setRawHtml] = useState('')
  const [editedHtml, setEditedHtml] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('saved')

  const format = (html) => beautifyHtml(html || '', BEAUTIFY_OPTS)
  const isDirty = editedHtml !== format(rawHtml)

  const loadEmail = useCallback(async (id) => {
    setLoading(true)
    setStatus('saved')
    try {
      const res = await fetch(`/api/email/${id}`)
      const data = await res.json()
      const raw = data.html || ''
      setRawHtml(raw)
      setEditedHtml(format(raw))
      setName(data.name || `Email ${id}`)
      setSubject(data.subject || '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadEmail(selectedId) }, [selectedId])

  useEffect(() => {
    if (rawHtml) setStatus(isDirty ? 'unsaved' : 'saved')
  }, [editedHtml, rawHtml, isDirty])

  const saveEmail = useCallback(async () => {
    if (!isDirty || saving) return
    setSaving(true)
    setStatus('saving')
    try {
      const res = await fetch(`/api/email/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editedHtml }),
      })
      const data = await res.json()
      if (data.ok) { setRawHtml(editedHtml); setStatus('saved') }
      else setStatus('error')
    } catch { setStatus('error') }
    finally { setSaving(false) }
  }, [isDirty, saving, selectedId, editedHtml])

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveEmail() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [saveEmail])

  const currentIndex = filteredList.findIndex(e => e.id === selectedId)
  const prevEmail = filteredList[currentIndex - 1]
  const nextEmail = filteredList[currentIndex + 1]

  const navigate = (email) => {
    if (!email) return
    if (isDirty && !confirm('Ungespeicherte Änderungen. Trotzdem weiter?')) return
    setSelectedId(email.id)
  }

  const statusLabel = { saved: '✓ Gespeichert', unsaved: '● Ungespeichert', saving: '⏳ Speichern…', error: '✗ Fehler beim Speichern' }[status]
  const statusColor = { saved: '#10b981', unsaved: '#f59e0b', saving: '#6b7280', error: '#ef4444' }[status]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '13px' }}>

      {/* ── Header ── */}
      <div style={{ background: '#111827', color: '#fff', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '14px', marginRight: '6px', whiteSpace: 'nowrap' }}>✉ Email Review</span>
        <span style={{ color: '#4b5563', fontSize: '11px' }}>Journey:</span>
        <select value={profile} onChange={e => setProfile(e.target.value)} style={S.select}>
          <option value="">Alle Profile</option>
          <option value="feuer">🔥 Macher</option>
          <option value="wind">💨 Netzwerker</option>
          <option value="wasser">💧 Anker</option>
          <option value="fels">🪨 Architekt</option>
        </select>
        <select value={aspiration} onChange={e => setAspiration(e.target.value)} style={S.select}>
          <option value="">Alle Aspirationen</option>
          <option value="freedom">Freedom</option>
          <option value="impact">Impact</option>
          <option value="security">Security</option>
          <option value="growth">Growth</option>
        </select>
        <select value={barrier} onChange={e => setBarrier(e.target.value)} style={S.select}>
          <option value="">Alle Barrieren</option>
          <option value="vehicle">Vehicle</option>
          <option value="community">Community</option>
          <option value="confidence">Confidence</option>
          <option value="opportunity">Opportunity</option>
        </select>
        <a href="/info" style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '12px', textDecoration: 'none', border: '1px solid #374151', borderRadius: '5px', padding: '4px 10px' }}>
          ℹ Sequenz-Erklärung
        </a>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {filteredList.length} E-Mails
        </span>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: '215px', background: '#f9fafb', borderRight: '1px solid #e5e7eb', overflowY: 'auto', flexShrink: 0 }}>
          {GROUPS.map(group => {
            const visible = group.emails.filter(e => filteredList.some(f => f.id === e.id))
            if (!visible.length) return null
            const c = PHASE_COLORS[group.phase] || '#374151'
            return (
              <div key={group.key}>
                <div style={{ padding: '7px 12px 5px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: group.deactivated ? '#9ca3af' : c, background: group.deactivated ? '#f9fafb' : '#f3f4f6', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', opacity: group.deactivated ? 0.6 : 1 }}>
                  {group.label}
                </div>
                {visible.map(email => (
                  <div key={email.id} onClick={() => navigate(email)} style={{
                    padding: '8px 12px 8px 20px', cursor: 'pointer',
                    background: selectedId === email.id ? '#eff6ff' : 'transparent',
                    color: selectedId === email.id ? '#1d4ed8' : '#374151',
                    borderLeft: `3px solid ${selectedId === email.id ? '#1d4ed8' : 'transparent'}`,
                    borderBottom: '1px solid #f3f4f6',
                    fontSize: '12px',
                  }}>
                    {email.label}
                  </div>
                ))}
              </div>
            )
          })}
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Toolbar ── */}
          <div style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, background: '#fff' }}>
            <button onClick={() => navigate(prevEmail)} disabled={!prevEmail} style={{ ...S.navBtn, opacity: prevEmail ? 1 : 0.4 }}>← Zurück</button>
            <button onClick={() => navigate(nextEmail)} disabled={!nextEmail} style={{ ...S.navBtn, opacity: nextEmail ? 1 : 0.4 }}>Weiter →</button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{name}</span>
              {subject && <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '8px' }}>— {subject}</span>}
              <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '8px' }}>({currentIndex + 1}/{filteredList.length})</span>
            </div>
            <span style={{ fontSize: '11px', color: statusColor, minWidth: '140px', textAlign: 'right' }}>{statusLabel}</span>
            <button onClick={() => setEditedHtml(format(rawHtml))} disabled={!isDirty} style={{ ...S.navBtn, opacity: isDirty ? 1 : 0.4 }}>↺ Reset</button>
            <button onClick={saveEmail} disabled={!isDirty || saving} style={{
              ...S.navBtn,
              background: isDirty && !saving ? '#2563eb' : '#93c5fd',
              color: '#fff', border: 'none', fontWeight: 600,
              opacity: isDirty && !saving ? 1 : 0.6,
            }}>
              Speichern ⌘S
            </button>
          </div>

          {/* ── Preview ── */}
          <div style={{ flex: '0 0 55%', borderBottom: '1px solid #e5e7eb', overflow: 'hidden', position: 'relative', background: '#f0f0f0' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)', zIndex: 1, color: '#6b7280' }}>
                Wird geladen…
              </div>
            )}
            <iframe
              srcDoc={substituteTokens(editedHtml, profile, aspiration, selectedId)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>

          {/* ── Editor ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '4px 16px', fontSize: '10px', color: '#9ca3af', background: '#1e1e1e', borderBottom: '1px solid #2d2d2d', flexShrink: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              HTML-Editor — Texte direkt bearbeiten · Vorschau aktualisiert live · ⌘S zum Speichern
            </div>
            <textarea
              value={editedHtml}
              onChange={e => setEditedHtml(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: '12px 16px',
                fontFamily: '"Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace',
                fontSize: '12px', lineHeight: '1.65',
                background: '#1e1e1e', color: '#d4d4d4',
                border: 'none', outline: 'none', resize: 'none',
              }}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
