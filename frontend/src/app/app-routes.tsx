import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '../components/layout/app-shell';
import { ParentLoginPage, StaffLoginPage } from '../features/auth/login-pages';
import { HomeRedirect, RequireRole } from '../features/auth/require-role';
import { NotFoundPage } from './not-found-page';

// Code splitting per halaman: tiap role hanya mengunduh halamannya sendiri.
const AttendancePage = lazy(() => import('../features/admin/attendance/attendance-page').then((m) => ({ default: m.AttendancePage })));
const AdminDashboardPage = lazy(() => import('../features/admin/dashboard/admin-dashboard-page').then((m) => ({ default: m.AdminDashboardPage })));
const MasterDataLayout = lazy(() => import('../features/admin/master-data/master-data-shared').then((m) => ({ default: m.MasterDataLayout })));
const ParentsPage = lazy(() => import('../features/admin/master-data/parents-page').then((m) => ({ default: m.ParentsPage })));
const StudentsPage = lazy(() => import('../features/admin/master-data/students-page').then((m) => ({ default: m.StudentsPage })));
const SubjectsPage = lazy(() => import('../features/admin/master-data/subjects-page').then((m) => ({ default: m.SubjectsPage })));
const TutorsPage = lazy(() => import('../features/admin/master-data/tutors-page').then((m) => ({ default: m.TutorsPage })));
const AdminPayrollPage = lazy(() => import('../features/admin/payroll/payroll-page').then((m) => ({ default: m.AdminPayrollPage })));
const RecapPage = lazy(() => import('../features/admin/recap/recap-page').then((m) => ({ default: m.RecapPage })));
const ParentDashboardPage = lazy(() => import('../features/parent/parent-pages').then((m) => ({ default: m.ParentDashboardPage })));
const ParentHistoryPage = lazy(() => import('../features/parent/parent-pages').then((m) => ({ default: m.ParentHistoryPage })));
const AttendanceFormPage = lazy(() => import('../features/tutor/attendance-form-page').then((m) => ({ default: m.AttendanceFormPage })));
const TutorDashboardPage = lazy(() => import('../features/tutor/tutor-dashboard-page').then((m) => ({ default: m.TutorDashboardPage })));
const TutorHistoryPage = lazy(() => import('../features/tutor/tutor-history-page').then((m) => ({ default: m.TutorHistoryPage })));
const TutorPayrollPage = lazy(() => import('../features/tutor/tutor-payroll-page').then((m) => ({ default: m.TutorPayrollPage })));
const TutorProfilePage = lazy(() => import('../features/tutor/tutor-profile-page').then((m) => ({ default: m.TutorProfilePage })));

/**
 * Tiga entry route role (docs/15): `/admin`, `/tutor`, `/orang-tua-murid`,
 * masing-masing dengan nested route internal. Guard hanya untuk UI.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<HomeRedirect />} />
      <Route path="login" element={<StaffLoginPage />} />
      <Route path="login/orang-tua" element={<ParentLoginPage />} />

      <Route path="admin" element={<RequireRole role="admin"><AppShell /></RequireRole>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="absensi" element={<AttendancePage />} />
        <Route path="rekap" element={<RecapPage />} />
        <Route path="honor" element={<AdminPayrollPage />} />
        <Route path="master-data" element={<MasterDataLayout />}>
          <Route index element={<Navigate to="tutor" replace />} />
          <Route path="tutor" element={<TutorsPage />} />
          <Route path="siswa" element={<StudentsPage />} />
          <Route path="orang-tua" element={<ParentsPage />} />
          <Route path="mapel" element={<SubjectsPage />} />
        </Route>
      </Route>

      <Route path="tutor" element={<RequireRole role="tutor"><AppShell /></RequireRole>}>
        <Route index element={<TutorDashboardPage />} />
        <Route path="absensi" element={<AttendanceFormPage />} />
        <Route path="riwayat" element={<TutorHistoryPage />} />
        <Route path="honor" element={<TutorPayrollPage />} />
        <Route path="profil" element={<TutorProfilePage />} />
      </Route>

      <Route path="orang-tua-murid" element={<RequireRole role="parent"><AppShell /></RequireRole>}>
        <Route index element={<ParentDashboardPage />} />
        <Route path="riwayat" element={<ParentHistoryPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
