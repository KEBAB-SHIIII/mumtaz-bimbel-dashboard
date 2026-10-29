/**
 * Query key terpusat. Key selalu memuat role/entitas/filter/periode agar cache
 * tidak bocor antar halaman atau antar akun (docs/04 §9). Cache dibersihkan
 * total saat login/logout.
 */
export const queryKeys = {
  me: ['auth', 'me'] as const,

  admin: {
    dashboard: (period: string) => ['admin', 'dashboard', period] as const,
    attendance: (filters: object) => ['admin', 'attendance', 'list', filters] as const,
    attendanceDetail: (id: string) => ['admin', 'attendance', 'detail', id] as const,
    recap: (period: string, groupBy: string) => ['admin', 'recap', period, groupBy] as const,
    payroll: (period: string) => ['admin', 'payroll', period] as const,
    masterData: (entity: string, filters: object) => ['admin', 'master-data', entity, filters] as const,
    masterDataAll: (entity: string) => ['admin', 'master-data', entity] as const,
  },

  tutor: {
    dashboard: (period: string) => ['tutor', 'dashboard', period] as const,
    assignments: ['tutor', 'assignments'] as const,
    attendance: (filters: object) => ['tutor', 'attendance', filters] as const,
    payroll: (period: string) => ['tutor', 'payroll', period] as const,
  },

  parent: {
    students: ['parent', 'students'] as const,
    dashboard: (studentId: string, period: string) => ['parent', 'dashboard', studentId, period] as const,
    progress: (studentId: string, period: string) => ['parent', 'progress', studentId, period] as const,
  },
};
