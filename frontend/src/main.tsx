import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/app-routes';
import { AppProviders } from './app/providers';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemen #root tidak ditemukan');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);
