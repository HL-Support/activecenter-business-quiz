/**
 * Einstiegspunkt der Schulungsseite /berater-info.
 *
 * Bewusst OHNE bootstrapQuiz(): Die Schulung hat keinen Coach-Slug, keinen Lead, kein
 * Tracking und keinen Video-Player. Sie durchlaeuft deshalb auch nicht den
 * Missing-Coach-Pfad des Quiz (src/app/bootstrap.js).
 *
 * React.createElement statt JSX-Syntax - dieselbe Konvention wie src/app/App.jsx.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

import BeraterInfo from './BeraterInfo.jsx';
import { TranslationsProvider, detectInitialLang } from './translations.js';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        TranslationsProvider,
        { initialLang: detectInitialLang(window.location.search) },
        React.createElement(BeraterInfo)
      )
    )
  );
}
