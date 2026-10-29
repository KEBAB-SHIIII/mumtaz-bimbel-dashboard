import { Route, Routes } from 'react-router';
import { HomePage } from './home-page';
import { NotFoundPage } from './not-found-page';

// Route role (`/admin`, `/tutor`, `/orang-tua-murid`) ditambahkan pada Phase 04.
export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
