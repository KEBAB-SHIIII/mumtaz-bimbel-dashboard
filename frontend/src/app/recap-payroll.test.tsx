import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useDemoBackend } from '../test/render';

async function openAs(username: string, password: string, menu: string, period: string) {
  renderApp('/login');
  const user = await loginStaff(username, password);
  await user.click(await screen.findByRole('link', { name: menu }));
  await choosePeriod(period);
  return user;
}

describe('Honor Tutor (Admin)', () => {
  it('total per tutor dapat ditelusuri ke rincian sesi; sesi belum disetujui tidak bernilai', async () => {
    useDemoBackend();
    const user = await openAs('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword, 'Honor Tutor', '2026-10');

    const farhan = (await screen.findByRole('heading', { name: 'Farhan' })).closest('section');
    if (!farhan) throw new Error('kartu Farhan tidak ada');
    // Fixture Okt: Farhan 3 approved × Rp50.000 → Rp150.000.
    expect(within(farhan).getAllByText(/150\.000/).length).toBeGreaterThan(0);

    await user.click(within(farhan).getByRole('button', { name: /Rincian sesi \(5\)/ }));
    const table = within(farhan).getByRole('table', { name: 'Rincian sesi Farhan' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    // Sesi menunggu verifikasi tampil tanpa nominal.
    expect(within(table).getAllByText('Tidak dihitung')).toHaveLength(2);
    expect(within(table).getAllByText(/50\.000/).length).toBeGreaterThanOrEqual(3);
  });

  it('tidak ada klaim status pembayaran', async () => {
    useDemoBackend();
    await openAs('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword, 'Honor Tutor', '2026-10');
    await screen.findByRole('heading', { name: 'Farhan' });
    expect(screen.queryByText(/dibayar|lunas/i)).not.toBeInTheDocument();
  });
});

describe('Honor Saya (Tutor)', () => {
  it('hanya honor milik tutor login; rincian sesi langsung terbuka', async () => {
    useDemoBackend();
    await openAs('noreen', TEST_ONLY_CREDENTIALS.tutorPassword, 'Honor Saya', '2026-10');
    const table = await screen.findByRole('table', { name: 'Rincian sesi Noreen' });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(4);
    expect(screen.queryByText('Farhan')).not.toBeInTheDocument();
  });
});

describe('Rekap', () => {
  it('baris total periode berasal dari backend', async () => {
    useDemoBackend();
    await openAs('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword, 'Rekap', '2026-10');
    const table = await screen.findByRole('table');
    await waitFor(() => expect(table.querySelector('tfoot')).not.toBeNull());
    const footer = table.querySelector('tfoot');
    if (!footer) throw new Error('tfoot tidak ada');
    const cells = within(footer as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['Total', '9', '4', '3', '1', '1', '300 menit']);
  });
});
