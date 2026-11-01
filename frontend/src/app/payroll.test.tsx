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

    // Fixture Okt: kotor Rp200.000, potongan Rp40.000 (4 sesi × Rp10.000), gaji Rp160.000.
    const metric = async (label: string) => (await screen.findByText(label)).closest('div');
    expect(await metric('Total pendapatan kotor')).toHaveTextContent(/Rp\s?200\.000/);
    expect(await metric('Total pendapatan bersih')).toHaveTextContent(/Rp\s?40\.000/);
    expect(await metric('Total gaji yang harus dibayarkan')).toHaveTextContent(/Rp\s?160\.000/);

    const farhan = (await screen.findByRole('heading', { name: 'Farhan' })).closest('section');
    if (!farhan) throw new Error('kartu Farhan tidak ada');
    // Farhan: 3 sesi valid × Rp50.000 = Rp150.000; potongan Rp30.000; bersih Rp120.000.
    expect(within(farhan).getByText('Total pendapatan bersih tutor').parentElement).toHaveTextContent(/Rp\s?120\.000/);
    expect(within(farhan).getByText('Jumlah sesi valid').parentElement).toHaveTextContent('3 sesi');
    expect(within(farhan).getByText('Subtotal (kotor)').parentElement).toHaveTextContent(/Rp\s?150\.000/);
    expect(within(farhan).getByText('Potongan admin').parentElement).toHaveTextContent(/Rp\s?30\.000/);

    await user.click(within(farhan).getByRole('button', { name: /Rincian sesi \(5\)/ }));
    const table = within(farhan).getByRole('table', { name: 'Rincian sesi Farhan' });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(5);
    // Kolom tarif = tarif les (kotor); tidak ada kolom "Nilai".
    expect(within(table).getByRole('columnheader', { name: 'Tarif (kotor)' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(within(table).getAllByText('Tidak dihitung')).toHaveLength(2);
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
    // Noreen Okt: 1 sesi valid → Rp50.000 − Rp10.000 = Rp40.000.
    expect((await screen.findByText('Pendapatan bersih bulan ini')).closest('div')).toHaveTextContent(/Rp\s?40\.000/);
    const table = await screen.findByRole('table', { name: 'Rincian honor per sesi' });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(4);
    expect(within(table).getByRole('columnheader', { name: 'Honor (bersih)' })).toBeInTheDocument();
    expect(screen.queryByText(/50\.000|kotor|Potongan/)).not.toBeInTheDocument();
    expect(screen.queryByText('Farhan')).not.toBeInTheDocument();
  });
});
