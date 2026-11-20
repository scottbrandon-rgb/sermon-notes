// Client-side PDF of a person's notes, with the series graphic. Loaded only when needed.
import { jsPDF } from 'jspdf';

// jsPDF's built-in fonts cover Latin-1 plus a few typographic marks. Keep those, swap or drop the rest.
const OK_EXTRA = new Set([0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026, 0x2122]);
export function pdfSafe(s) {
  return String(s)
    .replace(/→/g, '->')
    .replace(/[   ]/g, ' ')
    .split('')
    .filter((ch) => ch.charCodeAt(0) < 0x100 || OK_EXTRA.has(ch.charCodeAt(0)))
    .join('');
}

const NAVY = [19, 30, 41];
const MUTED = [78, 69, 68];
const RULE = [222, 216, 205];

/**
 * @param model  from exportModel()
 * @param image  optional { dataUrl: 'data:image/jpeg;base64,...', w, h }
 * @returns Blob (application/pdf)
 */
export function buildPdf(model, image) {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 54;
  const bottom = H - 60;
  let y = M;

  const ensure = (need) => {
    if (y + need > bottom) { pdf.addPage(); y = M; }
  };
  const write = (text, { x = M, width = W - 2 * M, size = 11.5, font = 'times', style = 'normal', color = NAVY, lead = 1.45 } = {}) => {
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(pdfSafe(text), width);
    const lh = size * lead;
    lines.forEach((ln) => { ensure(lh); pdf.text(ln, x, y + size); y += lh; });
    return lines.length;
  };

  // ----- cover block: series graphic beside the title, or title alone -----
  let textX = M;
  let textW = W - 2 * M;
  let coverBottom = y;
  if (image && image.dataUrl) {
    const iw = 236;
    const ih = Math.round(iw * (image.h / image.w));
    pdf.addImage(image.dataUrl, 'JPEG', M, y, iw, ih);
    textX = M + iw + 20;
    textW = W - M - textX;
    coverBottom = y + ih;
  }
  const startY = y;
  if (model.series) write(model.series.toUpperCase(), { x: textX, width: textW, size: 8.5, font: 'helvetica', style: 'bold', color: MUTED, lead: 1.3 });
  y += 4;
  write(model.title, { x: textX, width: textW, size: 20, font: 'helvetica', style: 'bold', lead: 1.2 });
  y += 4;
  if (model.date) write(model.date, { x: textX, width: textW, size: 10.5, font: 'helvetica', color: MUTED });
  if (model.refs.length) write(model.refs.join('  ·  '), { x: textX, width: textW, size: 10.5, font: 'helvetica', style: 'bold', color: MUTED });
  y = Math.max(y, coverBottom, startY) + 18;
  pdf.setDrawColor(...RULE);
  pdf.line(M, y, W - M, y);
  y += 22;

  // ----- sections -----
  model.sections.forEach((s) => {
    ensure(70);
    if (s.isPoint) {
      pdf.setFillColor(...NAVY);
      pdf.circle(M + 9, y + 9, 9, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text(String(s.n), M + 9, y + 12.2, { align: 'center' });
      if (s.kicker) {
        pdf.setTextColor(...MUTED);
        pdf.setFontSize(9);
        pdf.text(pdfSafe(s.kicker).toUpperCase(), M + 26, y + 12);
      }
      y += 26;
    } else {
      write('RESPOND', { size: 8.5, font: 'helvetica', style: 'bold', color: MUTED, lead: 1.3 });
      y += 4;
    }
    write(s.heading, { size: 14, font: 'helvetica', style: 'bold', lead: 1.35 });
    y += 6;

    s.scriptures.forEach((r) => {
      write('Scripture: ' + r, { x: M + 14, width: W - 2 * M - 14, size: 10, font: 'helvetica', style: 'bold', color: MUTED });
      y += 3;
    });
    s.lines.forEach((l) => {
      ensure(22);
      const startLine = y;
      pdf.setFillColor(...NAVY);
      pdf.rect(M + 3, startLine + 6.2, 4, 4, 'F');
      write(l.text, { x: M + 18, width: W - 2 * M - 18, size: 11.5, font: 'times' });
      if (l.cite) write('— ' + l.cite, { x: M + 18, width: W - 2 * M - 18, size: 9.5, font: 'helvetica', color: MUTED, lead: 1.4 });
      y += 5;
    });

    if (s.hasNote) {
      y += 4;
      const label = s.isPoint ? `My notes · Point ${s.n}` : 'My response';
      const body = s.note || '';
      const lines = body ? pdf.splitTextToSize(pdfSafe(body), W - 2 * M - 24) : [];
      const boxH = Math.max(54, 34 + lines.length * 15);
      ensure(boxH + 8);
      pdf.setDrawColor(...MUTED);
      pdf.setLineWidth(0.75);
      pdf.roundedRect(M, y, W - 2 * M, boxH, 4, 4, 'S');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...MUTED);
      pdf.text(label.toUpperCase(), M + 12, y + 16);
      if (lines.length) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.setTextColor(...NAVY);
        lines.forEach((ln, i) => pdf.text(ln, M + 12, y + 33 + i * 15));
      }
      y += boxH + 6;
    }
    y += 14;
    ensure(10);
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.5);
    pdf.line(M, y, W - M, y);
    y += 20;
  });

  // ----- footer on every page -----
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTED);
    pdf.text(pdfSafe(model.church), M, H - 34);
    pdf.text(`${i} of ${pages}`, W - M, H - 34, { align: 'right' });
  }
  return pdf.output('blob');
}
