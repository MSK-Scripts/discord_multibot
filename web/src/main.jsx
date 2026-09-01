import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts are bundled locally. The dashboard ships a strict CSP with no external
// hosts, so a font CDN would simply be blocked. Only the weights actually used
// are imported, so the payload stays small.
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/syne/600.css';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';

import App from './App.jsx';
import './index.css';
import { loadAndApplyDashboardSettings } from './settings.js';
import { I18nProvider } from './i18n.jsx';

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

// The accent and favicon are applied BEFORE the first render, so there is no
// flash of the default theme. Best effort and fast (a tiny same-origin JSON): if
// it fails or is slow, the built-in defaults are rendered anyway.
loadAndApplyDashboardSettings().finally(render);
