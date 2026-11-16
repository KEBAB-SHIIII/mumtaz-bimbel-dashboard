import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

async function openAs(username: string, password: string, menu: string, period: string) {
  renderApp('/login');
  const user = await loginStaff(username, password);
  await user.click(await screen.findByRole('link', { name: menu }));
  // Tunggu halaman tujuan (lazy route) agar dropdown Periode bukan milik Dashboard.
  await screen.findByRole('heading', { name: menu, level: 1 });
  await choosePeriod(period);
  return user;
}

describe('Honor Tutor (Admin)', () => {
  it('tiga metrik bulan ini + rincian per tutor: sesi valid, kotor, potongan admin, bersih', async () => {
    useFakeBackend();
    const user = await openAs('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword, 'Honor Tutor', '2026-10');

    // Fixture Okt: kotor Rp340.000, potongan Rp60.000 (2 × Rp20.000 + 2 × Rp10.000), gaji Rp280.000.
    const metric = async (label: string) => (await screen.findByText(label)).closest('div');
    expect(await metric('Total pendapatan kotor')).toHaveTextContent(/Rp\s?340\.000/);
    expect(await metric('Total pendapatan bersih')).toHaveTextContent(/Rp\s?60\.000/);
    expect(await metric('Total gaji yang harus dibayarkan')).toHaveTextContent(/Rp\s?280\.000/);

    const farhan = (await screen.findByRole('heading', { name: 'Farhan' })).closest('section');
    if (!farhan) throw new Error('kartu Farhan tidak ada');
    // Farhan: 2 × Rp90.000 + Rp80.000 = Rp260.000; potongan Rp50.000; bersih Rp210.000.
    expect(within(farhan).getByText('Total pendapatan bersih tutor').parentElement).toHaveTextContent(/Rp\s?210\.000/);
    expect(within(farhan).getByText('Jumlah sesi valid').parentElement).toHaveTextContent('3 sesi');
    expect(within(farhan).getByText('Subtotal (kotor)').parentElement).toHaveTextContent(/Rp\s?260\.000/);
    expect(within(farhan).getByText('Potongan admin').parentElement).toHaveTextContent(/Rp\s?50\.000/);

    await user.click(within(farhan).getByRole('button', { name: /Rincian sesi \(5\)/ }));
    const table = within(farhan).getByRole('table', { name: 'Rincian sesi Farhan' });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(5);
    // Kolom tarif = tarif les (kotor); tidak ada kolom "Nilai".
    expect(within(table).getByRole('columnheader', { name: 'Tarif (kotor)' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(within(table).getAllByText('Tidak dihitung')).toHaveLength(2);
    // Setiap nama siswa diberi label jenjang dari data kelasnya, mis. "Aisyah (SD)".
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect((row as HTMLTableRowElement).cells[1]).toHaveTextContent(/^.+ \((PAUD|TK|SD|SMP|SMA)\)$/);
    }
  });

  it('tidak ada klaim status pembayaran', async () => {
    useFakeBackend();
    await openAs('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword, 'Honor Tutor', '2026-10');
    await screen.findByRole('heading', { name: 'Farhan' });
    expect(screen.queryByText(/sudah dibayar|lunas/i)).not.toBeInTheDocument();
  });
});

describe('Honor Saya (Tutor)', () => {
  it('hanya pendapatan bersih milik tutor login (tanpa tarif kotor & potongan)', async () => {
    useFakeBackend();
    await openAs('noreen', TEST_ONLY_CREDENTIALS.tutorPassword, 'Honor Saya', '2026-10');
    // Noreen Okt: 1 sesi valid → Rp80.000 − Rp10.000 = Rp70.000.
    expect((await screen.findByText('Pendapatan bersih bulan ini')).closest('div')).toHaveTextContent(/Rp\s?70\.000/);
    const table = await screen.findByRole('table', { name: 'Rincian honor per sesi' });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(4);
    expect(within(table).getByRole('columnheader', { name: 'Honor (bersih)' })).toBeInTheDocument();
    expect(screen.queryByText(/80\.000|kotor|Potongan/)).not.toBeInTheDocument();
    expect(screen.queryByText('Farhan')).not.toBeInTheDocument();
  });
});
