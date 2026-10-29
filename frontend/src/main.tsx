import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/app-routes';
import { AppProviders } from './app/providers';
import './styles/index.css';

async function bootstrap() {
  // Dibandingkan langsung dengan konstanta build-time agar bundler membuang cabang
  // ini (beserta chunk fixture sintetis) sepenuhnya dari build mode live.
  if (import.meta.env.VITE_API_MODE === 'demo') {
    const { installDemoAdapter } = await import('./features/demo/demo-adapter');
    installDemoAdapter();
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Elemen #root tidak ditemukan');

  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
