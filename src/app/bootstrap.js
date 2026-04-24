import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeQuizEnvironment, getCurrentSlug, validateSlug } from '../lib/core.js';
import { QuizPage, bindLegalModal } from './App.jsx';

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

export async function bootstrapQuiz() {
  const initialSlug = getCurrentSlug();

  await processResumeToken();

  const coach = await initializeQuizEnvironment();

  if (!coach) {
    return;
  }

  renderApp();
  bindLegalModal();
  bindPopstateGuard(initialSlug);
}
