import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  initializeQuizEnvironment,
  adoptResumeLeadRun,
  getCurrentSlug,
  validateSlug,
  getPreferredLang,
  setPreferredLang,
  trackQuizAnalytics,
} from '../lib/core.js';
import { QuizPage, bindLegalModal } from './App.jsx';

const MISSING_COACH_COPY = {
  de: {
    badge: 'Oops',
    title: 'Leider nichts gefunden',
    body: 'Dieser Link ist unvollständig oder nicht mehr gültig. Bitte frage deinen Ansprechpartner nach dem korrekten Link.',
  },
  it: {
    badge: 'Oops',
    title: 'Purtroppo non abbiamo trovato nulla',
    body: 'Questo link è incompleto o non è più valido. Chiedi al tuo referente il link corretto.',
  },
  en: {
    badge: 'Oops',
    title: 'Nothing found here',
    body: 'This link is incomplete or no longer valid. Please ask your contact person for the correct link.',
  },
  fr: {
    badge: 'Oops',
    title: "Rien trouvé ici",
    body: "Ce lien est incomplet ou n'est plus valable. Demande à ton interlocuteur le lien correct.",
  },
  ru: {
    badge: 'Oops',
    title: 'К сожалению, ничего не найдено',
    body: 'Эта ссылка неполная или больше не действительна. Попроси своего контактного человека прислать правильную ссылку.',
  },
  hu: {
    badge: 'Oops',
    title: 'Sajnos nem találtunk semmit',
    body: 'Ez a link hiányos vagy már nem érvényes. Kérlek, kérd el a helyes linket attól, akitől kaptad.',
  },
};

function renderApp() {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Missing #root container');
  }

  createRoot(rootElement).render(
    React.createElement(React.StrictMode, null, React.createElement(QuizPage, null))
  );
}

function decodeResumePayload(token) {
  try {
    const decoded = JSON.parse(atob(String(token || '').split('.')[1] || ''));
    const sessionHash = decoded.sessionHash;
    const email = decoded.email;
    const lang = decoded.lang || '';
    const lastVideoStep = decoded.lastVideoStep || 1;
    const resumeTarget = decoded.resumeTarget || 'result';
    const resumeStartPercent = decoded.resumeStartPercent || 0;
    const profileCode = decoded.profileCode || '';
    const aspiration = decoded.aspiration || '';
    const barrier = decoded.barrier || '';

    if (!sessionHash || !email) return null;
    return {
      sessionHash,
      email,
      lang,
      lastVideoStep,
      resumeTarget,
      resumeStartPercent,
      profileCode,
      aspiration,
      barrier,
    };
  } catch (error) {
    console.warn('Resume token decode failed:', error);
    return null;
  }
}

async function resolveResumePayload(token, target = '') {
  try {
    const response = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_resume_token',
        payload: { token, resumeTarget: target === 'videos' ? 'videos' : undefined },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.sessionHash || !data.email) {
      throw new Error(data.error || 'Resume token resolve failed');
    }

    return {
      sessionHash: data.sessionHash,
      leadHash: data.leadHash || '',
      email: data.email,
      lang: data.lang || '',
      firstName: data.firstName || '',
      memberId: data.memberId || '',
      refId: data.refId || '',
      beraterSlug: data.beraterSlug || '',
      lastVideoStep: data.lastVideoStep || 1,
      resumeTarget: data.resumeTarget || 'result',
      resumeStartPercent: data.resumeStartPercent || 0,
      profileCode: data.profileCode || '',
      aspiration: data.aspiration || '',
      barrier: data.barrier || '',
    };
  } catch (error) {
    console.warn('Resume token resolve failed, falling back to embedded payload:', error);
    return decodeResumePayload(token);
  }
}

async function resolveResumeKeyPayload(key, target = '') {
  try {
    const response = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_resume_key',
        payload: { key, resumeTarget: target === 'videos' ? 'videos' : undefined },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.sessionHash) {
      throw new Error(data.error || 'Resume key resolve failed');
    }

    return {
      sessionHash: data.sessionHash,
      leadHash: data.leadHash || '',
      email: data.email || '',
      lang: data.lang || '',
      firstName: data.firstName || '',
      memberId: data.memberId || '',
      refId: data.refId || '',
      beraterSlug: data.beraterSlug || '',
      lastVideoStep: data.lastVideoStep || 1,
      resumeTarget: data.resumeTarget || 'result',
      resumeStartPercent: data.resumeStartPercent || 0,
      profileCode: data.profileCode || '',
      aspiration: data.aspiration || '',
      barrier: data.barrier || '',
    };
  } catch (error) {
    console.warn('Resume key resolve failed:', error);
    return null;
  }
}

function applyResumePayload({
  sessionHash,
  email,
  lang,
  leadHash,
  firstName,
  memberId,
  beraterSlug,
  lastVideoStep,
  resumeTarget,
  resumeStartPercent,
  profileCode,
  aspiration,
  barrier,
}) {
  const normalizedLang = String(lang || '').trim().toLowerCase().slice(0, 2);
  if (['de', 'it', 'fr', 'ru', 'en', 'hu'].includes(normalizedLang)) {
    localStorage.setItem(`preferredLang:${beraterSlug || getCurrentSlug()}`, normalizedLang);
  }

  localStorage.setItem(
    'acQuizTrackingSession_v1',
    JSON.stringify({
      hash: sessionHash,
      memberId: memberId || '',
      slug: beraterSlug || '',
      updatedAt: Date.now(),
    })
  );

  localStorage.setItem(
    'acBizLead',
    JSON.stringify({
      firstName: firstName || email.split('@')[0],
      email: email,
    })
  );

  if (leadHash) {
    adoptResumeLeadRun({
      slug: beraterSlug || getCurrentSlug(),
      memberId: memberId || '',
      leadHash,
      sessionHash,
    });
  }

  localStorage.setItem('acResumeFromLink', 'true');
  localStorage.setItem('acResumeVideoStep', String(lastVideoStep || 1));
  localStorage.setItem(
    'acResumeTarget',
    resumeTarget === 'videos' ? 'videos' : resumeTarget === 'final' ? 'final' : 'result'
  );
  localStorage.setItem('acResumeStartPercent', String(resumeStartPercent || 0));
  if (profileCode) localStorage.setItem('acResumeProfileCode', String(profileCode));
  if (aspiration) localStorage.setItem('acResumeAspiration', String(aspiration));
  if (barrier) localStorage.setItem('acResumeBarrier', String(barrier));
  localStorage.setItem('acSessionIsResume', 'true');
  return true;
}

function cleanNurtureParam(value, maxLength = 80) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, maxLength);
}

function getNurtureAttributionParams() {
  const params = new URLSearchParams(window.location.search || '');
  const phase = cleanNurtureParam(params.get('acn_phase'), 24).toUpperCase();
  const emailId = cleanNurtureParam(params.get('acn_email'), 40);
  if (!phase && !emailId) return null;

  return {
    phase,
    emailId,
    run: cleanNurtureParam(params.get('acn_run'), 80),
    variant: cleanNurtureParam(params.get('acn_variant'), 120),
  };
}

function trackNurtureResumeOpened(resolved) {
  const attribution = getNurtureAttributionParams();
  const leadHash = cleanNurtureParam(resolved?.leadHash, 120);
  if (!attribution || !leadHash) return;

  const eventId = [
    'nurture_resume_opened',
    leadHash,
    attribution.phase || 'unknown',
    attribution.emailId || 'unknown',
  ].join('_');

  trackQuizAnalytics('nurture_resume_opened', {
    event_id: eventId,
    event_at: new Date().toISOString(),
    lead_hash: leadHash,
    session_hash: resolved.sessionHash || '',
    member_id: resolved.memberId || '',
    ref_id: resolved.refId || resolved.memberId || '',
    berater_slug: resolved.beraterSlug || getCurrentSlug(),
    acn_phase: attribution.phase,
    acn_email: attribution.emailId,
    acn_run: attribution.run,
    acn_variant: attribution.variant,
    source: 'mautic',
    resume_target: resolved.resumeTarget || 'result',
    last_video_step: resolved.lastVideoStep || 1,
  });
}

async function processResumeToken() {
  const params = new URLSearchParams(window.location.search);
  const resumeKey = params.get('r');
  const token = params.get('resume');
  const resumeTarget = params.get('target') === 'videos' ? 'videos' : '';

  if (resumeKey) {
    const resolvedByKey = await resolveResumeKeyPayload(resumeKey, resumeTarget);
    if (resolvedByKey) {
      const applied = applyResumePayload(resolvedByKey);
      if (applied) trackNurtureResumeOpened(resolvedByKey);
      return applied;
    }
  }

  if (!token) return false;

  const resolved = await resolveResumePayload(token, resumeTarget);
  if (!resolved) {
    return false;
  }

  const applied = applyResumePayload(resolved);
  if (applied) trackNurtureResumeOpened(resolved);
  return applied;
}

function bindPopstateGuard(initialSlug) {
  window.addEventListener('popstate', function () {
    const pathSlug =
      window.location.pathname.replace(/^\/+/, '').toLowerCase().split('/')[0] || 'default';

    if ((validateSlug(pathSlug) ? pathSlug : 'default') !== initialSlug) {
      window.location.reload();
    }
  });
}

function renderMissingCoachPage() {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  function render(lang) {
    const copy = MISSING_COACH_COPY[lang] || MISSING_COACH_COPY.de;
    rootElement.innerHTML = `
      <div style="
        min-height:100vh;
        background:radial-gradient(ellipse at 20% 15%,rgba(201,168,76,0.06) 0%,transparent 45%),
          radial-gradient(ellipse at 80% 85%,rgba(74,100,200,0.06) 0%,transparent 45%),#070B14;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:24px 16px;font-family:'DM Sans',system-ui,sans-serif;">

        <div style="width:100%;max-width:520px;">

          <div style="display:flex;justify-content:center;gap:8px;margin-bottom:48px;flex-wrap:wrap;">
            ${['de', 'it', 'en', 'fr', 'ru', 'hu'].map(function (code) {
              const active = code === lang;
              return `<button data-lang="${code}" style="
                border:1px solid ${active ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.1)'};
                background:${active ? 'rgba(201,168,76,0.1)' : 'transparent'};
                color:${active ? '#C9A84C' : 'rgba(245,240,232,0.35)'};
                border-radius:100px;padding:7px 14px;font-size:11px;font-weight:600;
                letter-spacing:2.5px;text-transform:uppercase;cursor:pointer;
                font-family:'DM Sans',system-ui,sans-serif;transition:all 0.2s;">${code}</button>`;
            }).join('')}
          </div>

          <div style="
            background:rgba(255,255,255,0.028);border-radius:26px;
            border:1px solid rgba(201,168,76,0.13);
            padding:clamp(36px,6vw,56px) clamp(24px,5vw,48px);
            backdrop-filter:blur(20px);text-align:center;">

            <div style="
              display:inline-flex;align-items:center;justify-content:center;
              width:64px;height:64px;border-radius:50%;
              background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);
              margin-bottom:28px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <div style="
              font-size:11px;letter-spacing:3.5px;text-transform:uppercase;
              color:#C9A84C;margin-bottom:14px;font-weight:600;">${copy.badge}</div>

            <h1 style="
              font-family:'Cormorant Garamond',Georgia,serif;
              font-size:clamp(30px,5vw,42px);line-height:1.15;
              color:#F5F0E8;margin:0 0 20px;font-weight:600;">${copy.title}</h1>

            <p style="
              font-size:15px;line-height:1.75;
              color:rgba(245,240,232,0.55);margin:0 0 36px;
              max-width:360px;margin-left:auto;margin-right:auto;">${copy.body}</p>

          </div>

        </div>
      </div>
    `;

    rootElement.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const l = btn.getAttribute('data-lang');
        setPreferredLang(l);
        render(l);
      });
    });

  }

  render(getPreferredLang());
}

export async function bootstrapQuiz() {
  const initialSlug = getCurrentSlug();

  const isResume = await processResumeToken();

  const initialization = await initializeQuizEnvironment({ deferLeadSystem: !isResume });
  const coach = initialization?.coach || null;

  if (!coach) {
    renderMissingCoachPage();
    return;
  }

  renderApp();
  bindLegalModal();
  bindPopstateGuard(initialSlug);
}
