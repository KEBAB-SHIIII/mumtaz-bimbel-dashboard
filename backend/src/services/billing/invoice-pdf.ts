import PDFDocument from 'pdfkit';
import { BUSINESS_TIME_ZONE, type BillingStudent, type Period } from '@mumtaz/contracts';
import { HOURLY_RATE_BY_TIER } from './tariff.js';

const LOCALE = 'id-ID';
const rupiah = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const formatRupiah = (amount: string | number) => rupiah.format(Number(amount));

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatPeriod(period: Period): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const formatIssued = (now: Date) =>
  new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: BUSINESS_TIME_ZONE }).format(now);

/** Nomor invoice deterministik per murid & periode: INV-202610-AB12CD. */
export function invoiceNumber(period: Period, studentId: string): string {
  return `INV-${period.replace('-', '')}-${studentId.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

/** Nama file unduhan aman (ASCII): tagihan-2026-10-aisyah.pdf. */
export function invoiceFileName(period: Period, studentName: string): string {
  const slug = studentName.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-') || 'murid';
  return `tagihan-${period}-${slug}.pdf`;
}

const COLORS = { text: '#1f1f1f', muted: '#6b6b6b', border: '#d9d9d9', band: '#f3f3f3', accent: '#1f1f1f' };
const MARGIN = 48;

/** Kolom tabel rincian sesi (lebar total = lebar halaman A4 − margin). */
const COLUMNS = [
  { key: 'no', label: 'No', width: 26, align: 'left' },
  { key: 'date', label: 'Tanggal', width: 70, align: 'left' },
  { key: 'time', label: 'Jam', width: 72, align: 'left' },
  { key: 'subject', label: 'Mata pelajaran', width: 110, align: 'left' },
  { key: 'tutor', label: 'Tutor', width: 76, align: 'left' },
  { key: 'duration', label: 'Durasi', width: 54, align: 'right' },
  { key: 'amount', label: 'Tarif', width: 91, align: 'right' },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

/**
 * Invoice PDF tagihan les satu murid untuk satu periode (A4). Isi hanya sesi yang dihitung,
 * dengan tarif per sesi = snapshot tarif kotor. Font standar PDF (Helvetica), tanpa aset eksternal.
 */
export function renderInvoicePdf(input: { period: Period; student: BillingStudent; now: Date }): Promise<Buffer> {
  const { period, student, now } = input;
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Tagihan Les ${student.student_name} — ${formatPeriod(period)}`, Author: 'Bimbel Mumtaz Sampit' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const width = right - left;

  // --- Kop -----------------------------------------------------------------
  doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(16).text('BIMBEL MUMTAZ SAMPIT', left, MARGIN);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Tagihan les bulanan', left, doc.y + 2);
  doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(20).text('INVOICE', left, MARGIN, { width, align: 'right' });
  const metaTop = MARGIN + 26;
  const meta: [string, string][] = [
    ['No. invoice', invoiceNumber(period, student.student_id)],
    ['Tanggal terbit', formatIssued(now)],
    ['Periode', formatPeriod(period)],
  ];
  meta.forEach(([label, value], index) => {
    const y = metaTop + index * 14;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(label, right - 210, y, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text).text(value, right - 120, y, { width: 120, align: 'right' });
  });

  let y = metaTop + meta.length * 14 + 14;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.border).stroke();
  y += 16;

  // --- Ditagihkan kepada ------------------------------------------------------
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('DITAGIHKAN KEPADA', left, y, { characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text)
    .text(student.parent_names.length > 0 ? `Orang tua/wali: ${student.parent_names.join(', ')}` : 'Orang tua/wali', left, y + 13, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text).text(`Murid: ${student.student_name}`, left, doc.y + 3, { width: width / 2 });
  doc.fillColor(COLORS.muted).text(`${student.grade} · ${student.school_name}`, left, doc.y + 1, { width: width / 2 });
  const billedBottom = doc.y;

  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('TOTAL TAGIHAN', left + width / 2, y, { width: width / 2, align: 'right', characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.accent).text(formatRupiah(student.total_amount), left + width / 2, y + 12, { width: width / 2, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`${student.sessions} sesi les`, left + width / 2, doc.y + 2, { width: width / 2, align: 'right' });

  y = Math.max(billedBottom, doc.y) + 22;

  // --- Tabel rincian sesi --------------------------------------------------------
  const ROW_PADDING = 6;
  const drawHeader = (top: number): number => {
    doc.rect(left, top, width, 22).fill(COLORS.band);
    let x = left;
    for (const column of COLUMNS) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.text)
        .text(column.label, x + 4, top + 7, { width: column.width - 8, align: column.align });
      x += column.width;
    }
    return top + 22;
  };
  const cells = (index: number, line: BillingStudent['lines'][number]): Record<ColumnKey, string> => ({
    no: String(index + 1),
    date: formatDate(line.lesson_date),
    time: line.start_time && line.end_time ? `${line.start_time.replace(':', '.')}–${line.end_time.replace(':', '.')}` : '—',
    subject: line.subject_name,
    tutor: line.tutor_name,
    duration: `${line.duration_minutes} mnt`,
    amount: formatRupiah(line.amount),
  });

  y = drawHeader(y);
  const pageBottom = doc.page.height - MARGIN - 40;
  student.lines.forEach((line, index) => {
    const values = cells(index, line);
    doc.font('Helvetica').fontSize(8.5);
    const height = Math.max(...COLUMNS.map((column) => doc.heightOfString(values[column.key], { width: column.width - 8 }))) + ROW_PADDING * 2;
    if (y + height > pageBottom) {
      doc.addPage();
      y = drawHeader(MARGIN);
    }
    let x = left;
    for (const column of COLUMNS) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
        .text(values[column.key], x + 4, y + ROW_PADDING, { width: column.width - 8, align: column.align });
      x += column.width;
    }
    y += height;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.border).stroke();
  });

  // --- Ringkasan --------------------------------------------------------------
  if (y + 90 > pageBottom) {
    doc.addPage();
    y = MARGIN;
  }
  y += 12;
  const summaryLeft = right - 220;
  const summary: [string, string, boolean][] = [
    ['Jumlah sesi', `${student.sessions} sesi`, false],
    ['Total tagihan', formatRupiah(student.total_amount), true],
  ];
  for (const [label, value, strong] of summary) {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9).fillColor(COLORS.text)
      .text(label, summaryLeft, y, { width: 110 })
      .text(value, summaryLeft + 110, y, { width: 110, align: 'right' });
    y += strong ? 18 : 15;
  }

  // --- Catatan -----------------------------------------------------------------
  y += 16;
  const rates = Object.entries(HOURLY_RATE_BY_TIER)
    .map(([tier, rate]) => `${tier} ${formatRupiah(rate)}/jam`)
    .join(', ');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.text).text('Catatan', left, y);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(
    `Tarif les per jenjang: ${rates}. Sampai 60 menit dihitung satu jam; setiap 30 menit penuh berikutnya ditambah setengah tarif. ` +
      'Hanya sesi yang tercatat valid yang ditagihkan.',
    left,
    doc.y + 3,
    { width },
  );

  // --- Footer & nomor halaman ------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    // Footer ada di area margin bawah: tanpa ini pdfkit menganggapnya meluap dan menambah halaman kosong.
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - MARGIN + 10;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      .text('Dokumen ini dibuat otomatis oleh sistem Bimbel Mumtaz Sampit.', left, footerY, { width: width / 2, lineBreak: false })
      .text(`Halaman ${page - range.start + 1} dari ${range.count}`, left + width / 2, footerY, { width: width / 2, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
