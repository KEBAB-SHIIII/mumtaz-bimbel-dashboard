import PDFDocument from 'pdfkit';
import { BUSINESS_TIME_ZONE, type BillingStudent, type Period } from '@mumtaz/contracts';
import { fileURLToPath } from 'node:url';

const LOCALE = 'id-ID';
const rupiah = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const formatRupiah = (amount: string | number) => rupiah.format(Number(amount));

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
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

/** Nama file unduhan aman (ASCII): Tagihan Aisyah - Oktober 2026.pdf. */
export function invoiceFileName(period: Period, studentName: string): string {
  const name = studentName.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ') || 'Siswa';
  return `Tagihan ${name} - ${formatPeriod(period)}.pdf`;
}

// Brand palette from the supplied Mumtaz logo; cyan is reserved for quiet emphasis.
const COLORS = { blue: '#26468F', cyan: '#6DCFE3', pale: '#E3F5FA', ink: '#172B4D', muted: '#62758B', line: '#DFE7EF', white: '#FFFFFF' };
const MARGIN = 44;
const LOGO = fileURLToPath(new URL('../../../assets/mumtaz-logo.jpg', import.meta.url));
const COLUMNS = [
  { key: 'no', label: 'NO.', width: 26, align: 'left' },
  { key: 'date', label: 'TANGGAL / JAM', width: 95, align: 'left' },
  { key: 'description', label: 'RINCIAN LES', width: 205, align: 'left' },
  { key: 'duration', label: 'DURASI', width: 65, align: 'right' },
  { key: 'amount', label: 'JUMLAH', width: 116.28, align: 'right' },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

/** A4 invoice with an embedded local logo, dated session prices and repeating page headers. */
export function renderInvoicePdf(input: { period: Period; student: BillingStudent; now: Date }): Promise<Buffer> {
  const { period, student, now } = input;
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true,
    info: { Title: `Tagihan ${student.student_name} - ${formatPeriod(period)}`, Author: 'Bimbel Mumtaz Sampit' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const right = doc.page.width - MARGIN;
  const width = right - MARGIN;
  const bottom = doc.page.height - 76;
  const text = (value: string, x: number, y: number, w: number, size = 9, color = COLORS.ink, bold = false, align: 'left' | 'right' = 'left') => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, y, {width:w,align,lineGap:3});
    return doc.y;
  };
  const logo = () => {
    // Clip the original JPEG at its white roundel; keep the source image intact.
    doc.save().circle(MARGIN + 35, 61, 35).fill(COLORS.white).restore();
    doc.save().circle(MARGIN + 35, 61, 33).clip();
    doc.image(LOGO, MARGIN - 2, 25.48, {width:74,height:74});
    doc.restore();
  };
  const header = (continuation = false) => {
    const height = continuation ? 74 : 166;
    doc.rect(0, 0, doc.page.width, height).fill(COLORS.blue);
    doc.rect(0, height, doc.page.width, 4).fill(COLORS.cyan);
    if (!continuation) {
      logo();
      text('Invoice', MARGIN, 110, width / 2, 30, COLORS.white);
      text('MUMTAZ BIMBEL', right - 250, 42, 250, 17, COLORS.white, true, 'right');
      text('Bimbingan belajar · Sampit', right - 250, 68, 250, 10, COLORS.white, false, 'right');
      text(`Tagihan les bulanan\n${formatPeriod(period)}`, right - 250, 113, 250, 10, COLORS.white, false, 'right');
    } else {
      text('MUMTAZ BIMBEL', MARGIN, 25, 240, 14, COLORS.white, true);
      text(`${invoiceNumber(period,student.student_id)}\n${student.student_name}`, right - 240, 24, 240, 9, COLORS.white, false, 'right');
    }
    return height + 27;
  };
  let y = header();
  const start = y;
  text('DITAGIHKAN KEPADA', MARGIN, y, 260, 8, COLORS.muted, true);
  y = text(student.parent_names.length ? student.parent_names.join(', ') : 'Orang tua / wali', MARGIN, y + 19, 270, 12, COLORS.ink, true);
  // Helvetica's PDF encoding does not support the grade-transition arrow.
  const gradeLabel = student.grade.replace(/\s*→\s*/g, ' ke ');
  y = text(`${student.student_name} (${gradeLabel})`, MARGIN, y + 5, 270, 10);
  y = text(student.school_name, MARGIN, y + 3, 270, 9, COLORS.muted);
  let metaY = start;
  for (const [label,value] of [
    ['NO. INVOICE',invoiceNumber(period,student.student_id)],
    ['TANGGAL TERBIT',formatIssued(now)],
  ]) {
    text(label ?? '',right-200,metaY,200,7.5,COLORS.muted,true,'right');
    metaY=text(value ?? '',right-200,metaY+13,200,9,COLORS.ink,false,'right')+10;
  }
  y=Math.max(y,metaY)+22;
  const tableHeader = (top:number) => {
    doc.moveTo(MARGIN,top).lineTo(right,top).lineWidth(0.7).strokeColor(COLORS.line).stroke();
    let x=MARGIN;
    for (const col of COLUMNS) {
      text(col.label,x+4,top+13,col.width-8,7.5,COLORS.blue,true,col.align);
      x+=col.width;
    }
    return top+37;
  };
  const newTablePage = () => {doc.addPage();return tableHeader(header(true));};
  if(y>bottom-90) y=newTablePage(); else y=tableHeader(y);
  student.lines.forEach((line,index)=>{
    const values:Record<ColumnKey,string>={
      no:String(index+1),
      date:`${formatDate(line.lesson_date)}\n${line.start_time && line.end_time ? `${line.start_time.replace(':','.')}–${line.end_time.replace(':','.')} WIB` : 'Jam belum tercatat'}`,
      description:`${line.subject_name}${line.grade ? ` · ${line.grade}` : ''}\nTutor: ${line.tutor_name}`,
      duration:`${line.duration_minutes} menit`,
      amount:`${formatRupiah(line.amount)}${line.hourly_rate ? `\n${formatRupiah(line.hourly_rate)}/jam` : ''}`,
    };
    doc.font('Helvetica').fontSize(9);
    const height=Math.max(48,...COLUMNS.map(c=>doc.heightOfString(values[c.key],{width:c.width-8,lineGap:3})+24));
    if(y+height+(index===student.lines.length-1?133:0)>bottom) y=newTablePage();
    let x=MARGIN;
    for(const col of COLUMNS) {
      text(values[col.key],x+4,y+12,col.width-8,9,col.key==='no'?COLORS.muted:COLORS.ink,false,col.align);
      x+=col.width;
    }
    y+=height;
    doc.moveTo(MARGIN,y).lineTo(right,y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  });
  const bandHeight=105;
  if(y+bandHeight+28>bottom) {doc.addPage();y=header(true);}
  // Match the reference: a light notes panel adjoining a solid blue total panel.
  y=Math.max(y+26,bottom-bandHeight);
  const notesWidth=width*0.59;
  doc.rect(MARGIN,y,notesWidth,bandHeight).fill(COLORS.pale);
  doc.rect(MARGIN+notesWidth,y,width-notesWidth,bandHeight).fill(COLORS.blue);
  text('CATATAN',MARGIN+16,y+17,notesWidth-32,8,COLORS.blue,true);
  text('Tagihan mengikuti kelas dan durasi pada setiap sesi les. Hubungi admin jika ada rincian yang perlu diperiksa.',MARGIN+16,y+35,notesWidth-32,9,COLORS.ink);
  text('TOTAL TAGIHAN',MARGIN+notesWidth+16,y+18,width-notesWidth-32,8,COLORS.white,true,'right');
  text(formatRupiah(student.total_amount),MARGIN+notesWidth+16,y+39,width-notesWidth-32,formatRupiah(student.total_amount).length>14?16:20,COLORS.white,true,'right');
  text(`${student.sessions} sesi les`,MARGIN+notesWidth+16,y+73,width-notesWidth-32,9,COLORS.white,false,'right');
  const range=doc.bufferedPageRange();
  for(let page=range.start;page<range.start+range.count;page++) {
    doc.switchToPage(page);
    doc.page.margins.bottom=0;
    text('Terima kasih telah belajar bersama Mumtaz.',MARGIN,doc.page.height-47,width-95,8,COLORS.muted);
    text(`${page-range.start+1} / ${range.count}`,right-80,doc.page.height-47,80,8,COLORS.muted,false,'right');
  }
  doc.end();
  return done;
}
