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
  const headerHeight = 26;
  const topMargin = 20 + headerHeight;
  const bottomMargin = 20;
  const hGap = 8;
  const vGap = 7;

  const usableWidth = pageWidth - leftMargin - rightMargin;
  const boxWidth = (usableWidth - (columns - 1) * hGap) / columns;
  const usableHeight = pageHeight - topMargin - bottomMargin;
  const boxHeight = (usableHeight - (rowsPerPage - 1) * vGap) / rowsPerPage;

  // Clean ASCII-safe header text for jsPDF built-in Helvetica font
  const cleanHeaderTitle =
    titleSubtitle
      .replace(/[^\x20-\x7E]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 42) || 'Batch Codes';

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Compact batch header strip at the top of each A4 page
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text(`Quick Quiz - ${cleanHeaderTitle}`, leftMargin, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Total: ${codes.length} Codes  |  Page ${pageIdx + 1} / ${totalPages}`,
      pageWidth - rightMargin,
      30,
      { align: 'right' }
    );

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(leftMargin, 37, pageWidth - rightMargin, 37);

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
      doc.setFontSize(13.5);
      doc.setTextColor(15, 23, 42);
      doc.text(item.code, x + boxWidth / 2, y + boxHeight / 2, {
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeSub = titleSubtitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 28) || 'Batch';
  const fileName = `QuickQuiz_${safeSub}_${codes.length}Codes_${stamp}.pdf`;

  // Native Android WebView bridge saves & opens Share/Save sheet directly
  if (typeof window !== 'undefined' && window.AndroidBridge?.saveExportedFile) {
    const dataUrl = doc.output('datauristring');
    window.AndroidBridge.saveExportedFile(fileName, dataUrl);
    return;
  }

  doc.save(fileName);
}
