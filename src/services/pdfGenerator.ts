import { jsPDF } from 'jspdf';
import type { AccessCode } from '../types/models';

export function exportAccessCodesA4Pdf(codes: AccessCode[], titleSubtitle: string): void {
  if (codes.length === 0) {
    throw new Error('PDF બનાવવા માટે ઓછામાં ઓછો ૧ કોડ હોવો જરૂરી છે.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4', // 595 x 842 pt
  });

  const pageWidth = 595;
  const pageHeight = 842;
  const columns = 5;
  const rowsPerPage = 15;
  const codesPerPage = columns * rowsPerPage; // 75 codes per page
  const totalPages = Math.ceil(codes.length / codesPerPage);

  const leftMargin = 22;
  const rightMargin = 22;
  const topMargin = 22;
  const bottomMargin = 22;
  const hGap = 8;
  const vGap = 8;

  const usableWidth = pageWidth - leftMargin - rightMargin;
  const boxWidth = (usableWidth - (columns - 1) * hGap) / columns;
  const usableHeight = pageHeight - topMargin - bottomMargin;
  const boxHeight = (usableHeight - (rowsPerPage - 1) * vGap) / rowsPerPage;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    const startIndex = pageIdx * codesPerPage;
    const endIndex = Math.min(startIndex + codesPerPage, codes.length);

    for (let i = startIndex; i < endIndex; i++) {
      const localIdx = i - startIndex;
      const row = Math.floor(localIdx / columns);
      const col = localIdx % columns;
      const x = leftMargin + col * (boxWidth + hGap);
      const y = topMargin + row * (boxHeight + vGap);

      const item = codes[i];
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, y, boxWidth, boxHeight, 5, 5, 'FD');

      doc.setFont('courier', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(item.code, x + boxWidth / 2, y + boxHeight / 2, {
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeSub = titleSubtitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 20) || 'Batch';
  doc.save(`Std10_Access_Codes_${safeSub}_${stamp}.pdf`);
}
