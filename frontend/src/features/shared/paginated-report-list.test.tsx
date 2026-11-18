import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { PaginatedReportList } from './paginated-report-list';

it('menampilkan navigasi mulai entri ke-13 dan membatasi kartu per halaman', async () => {
  const items = Array.from({ length: 13 }, (_, i) => i + 1);
  const list = (count: number) => (
    <MemoryRouter>
      <PaginatedReportList items={items.slice(0, count)} renderItem={(id) => <h2 key={id}>Entri {id}</h2>} />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  const view = render(list(12));
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  view.rerender(list(13));
  expect(screen.getAllByRole('heading')).toHaveLength(12);
  await user.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Entri 13' })).toBeInTheDocument();
  expect(screen.getByText('13–13 dari 13')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
  expect(screen.getByRole('heading', { name: 'Entri 1' })).toBeInTheDocument();
});
