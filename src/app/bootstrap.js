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
    hintMissing: 'Es sieht so aus, als würde der persönliche Handle im Link fehlen.',
    hintNotFound: 'Der angefragte Ansprechpartner konnte nicht gefunden werden.',
    hintLookup:
      'Der Link konnte gerade nicht sauber geprüft werden. Bitte versuche es gleich noch einmal.',
    primary: 'Link neu prüfen',
    secondary: 'Zur Hauptseite',
    support:
      'Wenn du den Link per Nachricht erhalten hast, frage deinen Ansprechpartner nach dem korrekten persönlichen Zugang.',
    urlLabel: 'URL',
    handleLabel: 'Handle',
    statusLabel: 'Status',
  },
  it: {
    badge: 'Oops',
    title: 'Purtroppo non abbiamo trovato nulla',
    body: 'Questo link è incompleto o non è più valido. Chiedi al tuo referente il link corretto.',
    hintMissing: 'Sembra che nel link manchi il handle personale.',
    hintNotFound: 'Non siamo riusciti a trovare il referente richiesto.',
    hintLookup:
      'Al momento non siamo riusciti a verificare correttamente il link. Riprova tra poco.',
    primary: 'Controlla di nuovo il link',
    secondary: 'Vai alla pagina principale',
    support:
      'Se hai ricevuto il link tramite messaggio, chiedi al tuo referente l’accesso personale corretto.',
    urlLabel: 'URL',
    handleLabel: 'Handle',
    statusLabel: 'Stato',
  },
  en: {
    badge: 'Oops',
    title: 'We could not find anything here',
    body: 'This link is incomplete or no longer valid. Please ask your contact person for the correct link.',
    hintMissing: 'It looks like the personal handle is missing from the link.',
    hintNotFound: 'We could not find the requested contact person.',
    hintLookup: 'We could not verify this link correctly right now. Please try again in a moment.',
    primary: 'Check the link again',
    secondary: 'Go to the main page',
    support:
      'If you received this link in a message, please ask your contact person for the correct personal access link.',
    urlLabel: 'URL',
    handleLabel: 'Handle',
    statusLabel: 'Status',
  },
  fr: {
    badge: 'Oops',
    title: "Oups, nous n'avons rien trouvé",
    body: "Ce lien est incomplet ou n'est plus valable. Demande à ton interlocuteur le lien correct.",
    hintMissing: 'Il semble que le handle personnel manque dans le lien.',
    hintNotFound: "Nous n'avons pas trouvé l'interlocuteur demandé.",
    hintLookup:
      "Nous n'avons pas pu vérifier correctement ce lien pour le moment. Réessaie dans un instant.",
    primary: 'Vérifier à nouveau le lien',
    secondary: "Aller à la page d'accueil",
    support:
      'Si tu as reçu ce lien par message, demande à ton interlocuteur le bon accès personnel.',
    urlLabel: 'URL',
    handleLabel: 'Handle',
    statusLabel: 'Statut',
  },
  ru: {
    badge: 'Oops',
    title: 'К сожалению, ничего не найдено',
    body: 'Эта ссылка неполная или больше не действительна. Попроси своего контактного человека прислать правильную ссылку.',
    hintMissing: 'Похоже, в ссылке отсутствует персональный handle.',
    hintNotFound: 'Нам не удалось найти указанного контактного человека.',
    hintLookup: 'Сейчас не удалось корректно проверить ссылку. Попробуй ещё раз чуть позже.',
    primary: 'Проверить ссылку ещё раз',
    secondary: 'На главную страницу',
    support:
      'Если ты получил эту ссылку в сообщении, попроси своего контактного человека прислать правильный персональный доступ.',
    urlLabel: 'URL',
    handleLabel: 'Handle',
    statusLabel: 'Статус',
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
    'acTrackingSession',
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

function renderMissingCoachPage(reason) {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  const lang = getPreferredLang();
  const copy = MISSING_COACH_COPY[lang] || MISSING_COACH_COPY.de;
  const hint =
    reason === 'missing_handle'
      ? copy.hintMissing
      : reason === 'coach_not_found'
        ? copy.hintNotFound
        : copy.hintLookup;

  rootElement.innerHTML = `
    <div style="min-height:100vh;background:
      radial-gradient(circle at 20% 0%, rgba(244,177,61,0.22), transparent 28%),
      radial-gradient(circle at 100% 0%, rgba(15,159,120,0.20), transparent 30%),
      linear-gradient(180deg, #061521 0%, #0e2234 52%, #f4f7fb 52%, #eef4f8 100%);
      font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a;">
      <div style="max-width:1120px;margin:0 auto;padding:32px 20px 72px;">
        <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:32px;">
          ${['de', 'it', 'en', 'fr', 'ru']
            .map(function (code) {
              const active = code === lang;
              return `<button data-lang="${code}" style="border:1px solid ${
                active ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.18)'
              };background:${active ? 'rgba(255,255,255,0.16)' : 'transparent'};color:#ffffff;border-radius:999px;padding:10px 14px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;">${code}</button>`;
            })
            .join('')}
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,0.9fr);gap:28px;align-items:start;">
          <div style="padding:18px 0 12px;">
            <div style="display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:12px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#84f5cf;font-size:12px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#84f5cf;box-shadow:0 0 0 8px rgba(132,245,207,0.12);"></span>
              ${copy.badge}
            </div>
            <h1 style="margin:22px 0 18px;font-size:clamp(38px,7vw,72px);line-height:0.96;font-weight:800;letter-spacing:-0.06em;color:#ffffff;max-width:760px;">${copy.title}</h1>
            <p style="max-width:700px;font-size:20px;line-height:1.6;color:rgba(255,255,255,0.82);margin:0 0 18px;">${copy.body}</p>
            <p style="max-width:640px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.62);margin:0 0 34px;">${hint}</p>
            <div style="display:flex;gap:14px;flex-wrap:wrap;">
              <button id="retryMissingCoach" style="border:none;background:linear-gradient(135deg,#f4b13d 0%,#ffd67e 100%);color:#08131d;border-radius:999px;padding:16px 22px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 18px 44px rgba(244,177,61,0.26);">${copy.primary}</button>
              <a href="https://www.global-sce.com/" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#ffffff;border-radius:999px;padding:16px 22px;font-size:15px;font-weight:700;">${copy.secondary}</a>
            </div>
          </div>
          <div style="border-radius:32px;background:rgba(255,255,255,0.96);box-shadow:0 24px 60px rgba(7,18,28,0.18);padding:26px;position:relative;overflow:hidden;">
            <div style="position:absolute;inset:auto -60px -70px auto;width:180px;height:180px;border-radius:999px;background:radial-gradient(circle, rgba(15,159,120,0.22), transparent 68%);"></div>
            <div style="position:absolute;inset:18px 18px auto auto;width:110px;height:110px;border-radius:26px;background:linear-gradient(135deg, rgba(244,177,61,0.16), rgba(15,159,120,0.10));filter:blur(2px);"></div>
            <div style="position:relative;z-index:1;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#0f8f6a;margin-bottom:12px;">Link-Check</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:-0.04em;color:#0f172a;margin-bottom:12px;">${copy.title}</div>
              <div style="font-size:15px;line-height:1.7;color:#475569;margin-bottom:22px;">${copy.support}</div>
              <div style="display:grid;gap:12px;">
                <div style="border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:16px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);">
                  <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${copy.urlLabel}</div>
                  <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:13px;line-height:1.6;color:#0f172a;word-break:break-word;">${window.location.href}</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
                  <div style="border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:16px;background:#f8fafc;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${copy.handleLabel}</div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;">${getCurrentSlug()}</div>
                  </div>
                  <div style="border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:16px;background:#f8fafc;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${copy.statusLabel}</div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;">${copy.badge}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  rootElement.querySelectorAll('[data-lang]').forEach(function (button) {
    button.addEventListener('click', function () {
      setPreferredLang(button.getAttribute('data-lang'));
    });
  });

  const retryButton = document.getElementById('retryMissingCoach');
  if (retryButton) {
    retryButton.addEventListener('click', function () {
      window.location.reload();
    });
  }
}

export async function bootstrapQuiz() {
  const initialSlug = getCurrentSlug();

  await processResumeToken();

  const initialization = await initializeQuizEnvironment();
  const coach = initialization?.coach || null;

  if (!coach) {
    renderMissingCoachPage(initialization?.reason || 'missing_handle');
    return;
  }

  renderApp();
  bindLegalModal();
  bindPopstateGuard(initialSlug);
}
