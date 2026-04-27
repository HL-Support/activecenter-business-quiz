import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  initializeQuizEnvironment,
  getCurrentSlug,
  validateSlug,
  getPreferredLang,
  setPreferredLang,
} from '../lib/core.js';
import { QuizPage, bindLegalModal } from './App.jsx';

const MISSING_COACH_COPY = {
  de: {
    badge: 'Oops',
    title: 'Leider nichts gefunden',
    body: 'Dieser Link ist unvollständig oder nicht mehr gültig. Bitte frage deinen Ansprechpartner nach dem korrekten Link.',
    retry: 'Erneut versuchen',
  },
  it: {
    badge: 'Oops',
    title: 'Purtroppo non abbiamo trovato nulla',
    body: 'Questo link è incompleto o non è più valido. Chiedi al tuo referente il link corretto.',
    retry: 'Riprova',
  },
  en: {
    badge: 'Oops',
    title: 'Nothing found here',
    body: 'This link is incomplete or no longer valid. Please ask your contact person for the correct link.',
    retry: 'Try again',
  },
  fr: {
    badge: 'Oops',
    title: "Rien trouvé ici",
    body: "Ce lien est incomplet ou n'est plus valable. Demande à ton interlocuteur le lien correct.",
    retry: 'Réessayer',
  },
  ru: {
    badge: 'Oops',
    title: 'К сожалению, ничего не найдено',
    body: 'Эта ссылка неполная или больше не действительна. Попроси своего контактного человека прислать правильную ссылку.',
    retry: 'Попробовать снова',
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
    const lastVideoStep = decoded.lastVideoStep || 1;

    if (!sessionHash || !email) return null;
    return { sessionHash, email, lastVideoStep };
  } catch (error) {
    console.warn('Resume token decode failed:', error);
    return null;
  }
}

async function resolveResumePayload(token) {
  try {
    const response = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_resume_token',
        payload: { token },
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
      email: data.email,
      lastVideoStep: data.lastVideoStep || 1,
    };
  } catch (error) {
    console.warn('Resume token resolve failed, falling back to embedded payload:', error);
    return decodeResumePayload(token);
  }
}

async function resolveResumeKeyPayload(key) {
  try {
    const response = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_resume_key',
        payload: { key },
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
      email: data.email || '',
      lastVideoStep: data.lastVideoStep || 1,
    };
  } catch (error) {
    console.warn('Resume key resolve failed:', error);
    return null;
  }
}

function applyResumePayload({ sessionHash, email, lastVideoStep }) {
  localStorage.setItem(
    'acQuizTrackingSession_v1',
    JSON.stringify({
      hash: sessionHash,
      memberId: '',
      slug: '',
      updatedAt: Date.now(),
    })
  );

  localStorage.setItem(
    'acBizLead',
    JSON.stringify({
      firstName: email.split('@')[0],
      email: email,
    })
  );

  localStorage.setItem('acResumeFromLink', 'true');
  localStorage.setItem('acResumeVideoStep', String(lastVideoStep || 1));
  localStorage.setItem('acSessionIsResume', 'true');
  return true;
}

async function processResumeToken() {
  const params = new URLSearchParams(window.location.search);
  const resumeKey = params.get('r');
  const token = params.get('resume');

  if (resumeKey) {
    const resolvedByKey = await resolveResumeKeyPayload(resumeKey);
    if (resolvedByKey) {
      return applyResumePayload(resolvedByKey);
    }
  }

  if (!token) return false;

  const resolved = await resolveResumePayload(token);
  if (!resolved) {
    return false;
  }

  return applyResumePayload(resolved);
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
            ${['de', 'it', 'en', 'fr', 'ru'].map(function (code) {
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

            <button id="retryMissingCoach" style="
              background:linear-gradient(135deg,#C9A84C,#C9A84CAA);
              color:#0A0A0A;border:none;border-radius:100px;
              padding:14px 36px;font-size:15px;font-weight:600;
              cursor:pointer;letter-spacing:0.3px;
              font-family:'DM Sans',system-ui,sans-serif;">${copy.retry}</button>
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

    document.getElementById('retryMissingCoach').addEventListener('click', function () {
      window.location.reload();
    });
  }

  render(getPreferredLang());
}

export async function bootstrapQuiz() {
  const initialSlug = getCurrentSlug();

  await processResumeToken();

  const initialization = await initializeQuizEnvironment();
  const coach = initialization?.coach || null;

  if (!coach) {
    renderMissingCoachPage();
    return;
  }

  renderApp();
  bindLegalModal();
  bindPopstateGuard(initialSlug);
}
