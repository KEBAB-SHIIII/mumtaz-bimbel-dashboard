import { screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../features/admin/api';
import { TEST_ONLY_CREDENTIALS, STUDENT_IDS } from '@mumtaz/contracts/fixtures';
import { loginStaff, renderApp, useFakeBackend } from '../test/render';

afterEach(()=>vi.restoreAllMocks());
it('class changes require preview before saving and keep history collapsed',async()=>{
  useFakeBackend();
  vi.spyOn(api,'fetchGradeHistory').mockResolvedValue({entries:[],audit:[]});
  const preview={preview_token:'a'.repeat(64),previous_grade:'3 SD',new_grade:'4 SD',previous_hourly_rate:'60000',new_hourly_rate:'80000',affected_sessions:[],billing_delta:'0',tutor_net_delta:'0'};
  const review=vi.spyOn(api,'previewGradeChange').mockResolvedValue(preview);
  const save=vi.spyOn(api,'applyGradeChange').mockResolvedValue(preview);
  renderApp('/admin/master-data/siswa');
  const user=await loginStaff('admin.demo',TEST_ONLY_CREDENTIALS.adminPassword);
  // Login goes to Dashboard; use navigation to reach the actual registered master route.
  await user.click(await screen.findByRole('button',{name:/Master Data/}));
  await user.click(await screen.findByRole('link',{name:'Siswa'}));
  await user.click(await screen.findByRole('button',{name:'Ubah kelas Aisyah'}));
  const dialog=within(await screen.findByRole('dialog'));
  expect(dialog.queryByRole('button',{name:'Simpan perubahan'})).not.toBeInTheDocument();
  await user.click(dialog.getByRole('button', { name: /Kelas baru/ }));
  await user.click(await screen.findByRole('option',{name:'4 SD'}));
  await user.click(dialog.getByRole('button',{name:'Tinjau perubahan'}));
  await dialog.findByText('3 SD → 4 SD');
  expect(save).not.toHaveBeenCalled();
  expect(review).toHaveBeenCalledWith(STUDENT_IDS.murid1,expect.objectContaining({grade:'4 SD'}));
  await user.click(dialog.getByRole('button',{name:'Simpan perubahan'}));
  expect(save).toHaveBeenCalledWith(STUDENT_IDS.murid1,expect.objectContaining({grade:'4 SD'}),'a'.repeat(64));
});
