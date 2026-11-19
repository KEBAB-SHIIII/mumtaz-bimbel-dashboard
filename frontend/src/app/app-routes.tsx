import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '../components/layout/app-shell';
import { ParentLoginPage, StaffLoginPage } from '../features/auth/login-pages';
import { HomeRedirect, RequireRole } from '../features/auth/require-role';
import { NotFoundPage } from './not-found-page';

// Halaman tersedia langsung agar loading modul tidak mendahului skeleton data.
import { AttendancePage } from '../features/admin/attendance/attendance-page';
import { AdminDashboardPage } from '../features/admin/dashboard/admin-dashboard-page';
import { MasterDataLayout } from '../features/admin/master-data/master-data-shared';
import { ParentsPage } from '../features/admin/master-data/parents-page';
import { StudentsPage } from '../features/admin/master-data/students-page';
import { SubjectsPage } from '../features/admin/master-data/subjects-page';
import { TutorsPage } from '../features/admin/master-data/tutors-page';
import { AdminPayrollPage } from '../features/admin/payroll/payroll-page';
import { BillingPage } from '../features/admin/billing/billing-page';
import { ParentDashboardPage } from '../features/parent/parent-pages';
import { ParentHistoryPage } from '../features/parent/parent-pages';
import { AttendanceFormPage } from '../features/tutor/attendance-form-page';
import { TutorDashboardPage } from '../features/tutor/tutor-dashboard-page';
import { TutorHistoryPage } from '../features/tutor/tutor-history-page';
import { TutorPayrollPage } from '../features/tutor/tutor-payroll-page';
import { TutorProfilePage } from '../features/tutor/tutor-profile-page';

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
        <Route path="penagihan" element={<BillingPage />} />
        {/* Rekap diganti Penagihan Orang Tua (revisi PM); tautan lama tetap berfungsi. */}
        <Route path="rekap" element={<Navigate to="/admin/penagihan" replace />} />
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
