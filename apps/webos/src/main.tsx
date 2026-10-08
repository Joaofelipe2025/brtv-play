import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Só o subconjunto latin: cobre português (ã, ç, é…) e evita levar devanágari/latin-ext no .ipk
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import { App } from './App';
import { hydrateStore } from './platform';
import './styles.css';

async function bootstrap(): Promise<void> {
  await hydrateStore();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
