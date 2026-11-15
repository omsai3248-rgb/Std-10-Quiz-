import { jsPDF } from 'jspdf';
import { getSubjectDisplayName, resolveCodeSubjectId, type AccessCode } from '../types/models';

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
  const columns = 3;
  const rowsPerPage = 9;
  const codesPerPage = columns * rowsPerPage;
  const totalPages = Math.ceil(codes.length / codesPerPage);

  const leftMargin = 26;
  const rightMargin = 26;
  const topHeaderY = 34;
  const gridTopY = 78;
  const bottomMargin = 24;
  const hGap = 10;
  const vGap = 10;

  const usableWidth = pageWidth - leftMargin - rightMargin;
  const boxWidth = (usableWidth - (columns - 1) * hGap) / columns;
  const usableHeight = pageHeight - gridTopY - bottomMargin;
  const boxHeight = (usableHeight - (rowsPerPage - 1) * vGap) / rowsPerPage;

  const dateText = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(26, 35, 126);
    doc.text('Std 10 Board Quiz - Access Codes', leftMargin, topHeaderY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(69, 90, 100);
    doc.text(
      `Total ${codes.length} codes | ${dateText}`,
      leftMargin,
      topHeaderY + 16
    );
    doc.text(
      `Page ${pageIdx + 1} / ${totalPages}`,
      pageWidth - rightMargin,
      topHeaderY,
      { align: 'right' }
    );

    doc.setDrawColor(197, 202, 233);
    doc.setLineWidth(1);
    doc.line(leftMargin, 62, pageWidth - rightMargin, 62);

    const startIndex = pageIdx * codesPerPage;
    const endIndex = Math.min(startIndex + codesPerPage, codes.length);

    for (let i = startIndex; i < endIndex; i++) {
      const localIdx = i - startIndex;
      const row = Math.floor(localIdx / columns);
      const col = localIdx % columns;
      const x = leftMargin + col * (boxWidth + hGap);
      const y = gridTopY + row * (boxHeight + vGap);

      const item = codes[i];
      if (item.isUsed) {
        doc.setFillColor(245, 245, 245);
      } else {
        doc.setFillColor(248, 250, 255);
      }
      doc.setDrawColor(57, 73, 171);
      doc.setLineWidth(1.2);
      doc.roundedRect(x, y, boxWidth, boxHeight, 8, 8, 'FD');

      const centerX = x + boxWidth / 2;
      const resolved = resolveCodeSubjectId(item.code, item.batchName, item.subjectId);
      const subjectEn =
        resolved === 'maths'
          ? 'Maths'
          : resolved === 'science'
            ? 'Science'
            : resolved === 'social_science'
              ? 'Social Science'
              : 'All Subjects';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(40, 53, 147);
      doc.text(`#${i + 1} - ${subjectEn}`, centerX, y + 17, { align: 'center' });

      doc.setFont('courier', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(17, 17, 17);
      doc.text(item.code, centerX, y + boxHeight / 2 + 5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(96, 125, 139);
      const footerText = item.isUsed
        ? `Used: ${item.usedByMobile.slice(-10)}`
        : `${getSubjectDisplayName(resolved) === subjectEn ? subjectEn : 'Std 10'} | Active`;
      doc.text(footerText, centerX, y + boxHeight - 9, { align: 'center' });
    }
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeSub = titleSubtitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 20) || 'Batch';
  doc.save(`Std10_Access_Codes_${safeSub}_${stamp}.pdf`);
}
