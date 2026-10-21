import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { tg } from './telegram';
import './styles.css';

tg.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
