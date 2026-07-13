import '../ac-track.js';
import { bootstrapQuiz } from './app/bootstrap.js';

function reportBootstrapFailure(error) {
  const detail = {
    code: 'bootstrap_failed',
    message: String(error?.message || 'Unknown bootstrap error').slice(0, 240),
    at: new Date().toISOString(),
  };

  window.__AC_BOOTSTRAP_STATUS__ = { ok: false, ...detail };
  window.dispatchEvent(new window.CustomEvent('ac:bootstrap-error', { detail }));
}

bootstrapQuiz()
  .then(() => {
    window.__AC_BOOTSTRAP_STATUS__ = { ok: true, at: new Date().toISOString() };
  })
  .catch(reportBootstrapFailure);
