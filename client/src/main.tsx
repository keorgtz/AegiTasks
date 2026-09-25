import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/features.css';
import './styles/focus-visuals.css';
import App from './App';
import { startAppUpdates } from './pwaUpdates';

startAppUpdates();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
