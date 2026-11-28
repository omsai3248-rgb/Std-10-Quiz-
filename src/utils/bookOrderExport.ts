import { jsPDF } from 'jspdf';
import type { BookOrder, BookOrderSubject, BookStockInventory } from '../types/models';

export interface BookOrderSummaryStats {
  totalAmount: number;
  totalOrders: number;
  totalBooks: number;
  doneAmount: number;
  doneOrders: number;
  doneBooks: number;
  pendingAmount: number;
  pendingOrders: number;
  pendingBooks: number;
  orderedMaths: number;
  orderedScience: number;
  orderedSocial: number;
  orderedCombo: number;
  inStockMaths: number;
  inStockScience: number;
  inStockSocial: number;
}

export function getBookSubjectLabel(subject: BookOrderSubject): string {
  switch (subject) {
    case 'maths':
      return 'ગણિત';
    case 'science':
      return 'વિજ્ઞાન';
    case 'social_science':
      return 'સામાજિક વિજ્ઞાન';
    case 'combo':
      return 'કોમ્બો';
  }
}

export function formatBookOrderDate(order: BookOrder): string {
  const ts = order.createdAt as unknown;
  if (!ts) return '-';
  let date: Date | null = null;
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    date = (ts as { toDate: () => Date }).toDate();
  } else if (typeof (ts as { seconds?: number }).seconds === 'number') {
    date = new Date((ts as { seconds: number }).seconds * 1000);
  } else if (ts instanceof Date) {
    date = ts;
  }
  if (!date || Number.isNaN(date.getTime())) return '-';
  try {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function computeBookOrderStats(
  orders: BookOrder[],
  stock: BookStockInventory
): BookOrderSummaryStats {
  let totalAmount = 0;
  let totalOrders = 0;
  let totalBooks = 0;
  let doneAmount = 0;
  let doneOrders = 0;
  let doneBooks = 0;
  let pendingAmount = 0;
  let pendingOrders = 0;
  let pendingBooks = 0;

  let orderedMaths = 0;
  let orderedScience = 0;
  let orderedSocial = 0;
  let orderedCombo = 0;

  for (const order of orders) {
    const qty = Math.max(0, Math.round(Number(order.quantity) || 0));
    const unitPrice = Math.max(0, Math.round(Number(order.unitPrice) || 0));
    const amount = Number.isFinite(order.totalAmount)
      ? Math.max(0, Math.round(order.totalAmount))
      : unitPrice * qty;

    totalOrders += 1;
    totalBooks += qty;
    totalAmount += amount;

    if (order.paymentStatus === 'done') {
      doneOrders += 1;
      doneBooks += qty;
      doneAmount += amount;
    } else {
      pendingOrders += 1;
      pendingBooks += qty;
      pendingAmount += amount;
    }

    if (order.subject === 'maths') {
      orderedMaths += qty;
    } else if (order.subject === 'science') {
      orderedScience += qty;
    } else if (order.subject === 'social_science') {
      orderedSocial += qty;
    } else if (order.subject === 'combo') {
      orderedCombo += qty;
      orderedMaths += qty;
      orderedScience += qty;
      orderedSocial += qty;
    }
  }

  return {
    totalAmount,
    totalOrders,
    totalBooks,
    doneAmount,
    doneOrders,
    doneBooks,
    pendingAmount,
    pendingOrders,
    pendingBooks,
    orderedMaths,
    orderedScience,
    orderedSocial,
    orderedCombo,
    inStockMaths: stock.maths - orderedMaths,
    inStockScience: stock.science - orderedScience,
    inStockSocial: stock.social_science - orderedSocial,
  };
}

// ============================================================================
// Pure-JS OOXML (.xlsx) Multi-Sheet Excel Workbook Builder (Full Gujarati UTF-8)
// ============================================================================

function xmlEscape(val: string | number): string {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

interface XlsxCell {
  value: string | number;
  type?: 's' | 'n';
  style?: number; // 0=default, 1=title, 2=header, 3=total, 4=done, 5=pending, 6=subtitle
}

function buildWorksheetXml(rows: XlsxCell[][], colWidths: number[]): string {
  const colsXml = colWidths
    .map(
      (w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
    )
    .join('');

  const sheetDataXml = rows
    .map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells
        .map((cell, cIdx) => {
          const ref = `${colIndexToLetter(cIdx)}${rowNum}`;
          const styleAttr = cell.style ? ` s="${cell.style}"` : '';
          if (cell.type === 'n' && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
            return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xmlEscape(
            cell.value
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${sheetDataXml}</sheetData>` +
    `</worksheet>`
  );
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipStore(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0, true); // Mod date
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central dir signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + endRecord.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of localChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(endRecord, pos);
  return out;
}

export function buildBookOrdersXlsxBytes(
  orders: BookOrder[],
  allOrdersForStock: BookOrder[],
  stock: BookStockInventory,
  filterLabel: string
): Uint8Array {
  const filteredStats = computeBookOrderStats(orders, stock);
  const fullStats = computeBookOrderStats(allOrdersForStock, stock);
  const generatedAt = new Date().toLocaleString('en-IN');

  // Sheet 1: Book Orders
  const orderRows: XlsxCell[][] = [
    [{ value: 'Quick Quiz - બુક ઓર્ડર મેનેજમેન્ટ રિપોર્ટ', style: 1 }],
    [{ value: `ફિલ્ટર: ${filterLabel}  |  તારીખ: ${generatedAt}`, style: 6 }],
    [],
    [
      { value: 'ક્રમ', style: 2 },
      { value: 'ગ્રાહકનું નામ', style: 2 },
      { value: 'વિષય', style: 2 },
      { value: 'એક બુકની કિંમત (₹)', style: 2 },
      { value: 'બુકની સંખ્યા', style: 2 },
      { value: 'કુલ રકમ (₹)', style: 2 },
      { value: 'પેમેન્ટ સ્થિતિ', style: 2 },
      { value: 'તારીખ', style: 2 },
    ],
  ];

  orders.forEach((order, idx) => {
    const isDone = order.paymentStatus === 'done';
    orderRows.push([
      { value: idx + 1, type: 'n' },
      { value: order.customerName },
      { value: getBookSubjectLabel(order.subject) },
      { value: order.unitPrice, type: 'n' },
      { value: order.quantity, type: 'n' },
      { value: order.totalAmount, type: 'n' },
      { value: isDone ? 'Done (મળી ગયા)' : 'બાકી', style: isDone ? 4 : 5 },
      { value: formatBookOrderDate(order) },
    ]);
  });

  orderRows.push([]);
  orderRows.push([
    { value: '', style: 3 },
    { value: 'કુલ ઓર્ડર સરવાળો', style: 3 },
    { value: `${filteredStats.totalOrders} ઓર્ડર`, style: 3 },
    { value: '', style: 3 },
    { value: filteredStats.totalBooks, type: 'n', style: 3 },
    { value: filteredStats.totalAmount, type: 'n', style: 3 },
    { value: `Done: ₹${filteredStats.doneAmount} | બાકી: ₹${filteredStats.pendingAmount}`, style: 3 },
    { value: '', style: 3 },
  ]);

  // Sheet 2: Stock & KPI Summary
  const summaryRows: XlsxCell[][] = [
    [{ value: 'સ્ટોક અને ઓર્ડર સારાંશ (Stock Summary)', style: 1 }],
    [{ value: `તારીખ: ${generatedAt}`, style: 6 }],
    [],
    [
      { value: 'સારાંશ વિગત', style: 2 },
      { value: 'ઓર્ડર સંખ્યા', style: 2 },
      { value: 'બુક સંખ્યા', style: 2 },
      { value: 'કુલ રકમ (₹)', style: 2 },
    ],
    [
      { value: 'કુલ ઓર્ડર' },
      { value: fullStats.totalOrders, type: 'n' },
      { value: fullStats.totalBooks, type: 'n' },
      { value: fullStats.totalAmount, type: 'n' },
    ],
    [
      { value: 'મળી ગયા (Done)', style: 4 },
      { value: fullStats.doneOrders, type: 'n', style: 4 },
      { value: fullStats.doneBooks, type: 'n', style: 4 },
      { value: fullStats.doneAmount, type: 'n', style: 4 },
    ],
    [
      { value: 'બાકી', style: 5 },
      { value: fullStats.pendingOrders, type: 'n', style: 5 },
      { value: fullStats.pendingBooks, type: 'n', style: 5 },
      { value: fullStats.pendingAmount, type: 'n', style: 5 },
    ],
    [],
    [
      { value: 'વિષય (સ્ટોક)', style: 2 },
      { value: 'કુલ સ્ટોક', style: 2 },
      { value: 'ઓર્ડર થયેલ', style: 2 },
      { value: 'સ્ટોકમાં બાકી', style: 2 },
    ],
    [
      { value: 'ગણિત' },
      { value: stock.maths, type: 'n' },
      { value: fullStats.orderedMaths, type: 'n' },
      { value: fullStats.inStockMaths, type: 'n' },
    ],
    [
      { value: 'વિજ્ઞાન' },
      { value: stock.science, type: 'n' },
      { value: fullStats.orderedScience, type: 'n' },
      { value: fullStats.inStockScience, type: 'n' },
    ],
    [
      { value: 'સામાજિક વિજ્ઞાન' },
      { value: stock.social_science, type: 'n' },
      { value: fullStats.orderedSocial, type: 'n' },
      { value: fullStats.inStockSocial, type: 'n' },
    ],
    [
      { value: 'કોમ્બો' },
      { value: 'ત્રણેયમાંથી ઘટે' },
      { value: fullStats.orderedCombo, type: 'n' },
      { value: 'ત્રણેયમાંથી ઘટે' },
    ],
  ];

  const sheet1Xml = buildWorksheetXml(orderRows, [8, 28, 18, 18, 15, 16, 20, 14]);
  const sheet2Xml = buildWorksheetXml(summaryRows, [24, 18, 18, 20]);

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="6">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FF047857"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFB45309"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="6">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="7">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0"/>` +
    `<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0"/>` +
    `<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0"/>` +
    `<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `</cellXfs>` +
    `</styleSheet>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="Book Orders" sheetId="1" r:id="rId1"/>` +
    `<sheet name="Stock Summary" sheetId="2" r:id="rId2"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const enc = new TextEncoder();
  return buildZipStore([
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml) },
    { name: '_rels/.rels', data: enc.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: enc.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet1Xml) },
    { name: 'xl/worksheets/sheet2.xml', data: enc.encode(sheet2Xml) },
  ]);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function triggerFileDownload(fileName: string, mimeType: string, bytes: Uint8Array): void {
  if (typeof window !== 'undefined' && window.AndroidBridge?.saveExportedFile) {
    const dataUrl = `data:${mimeType};base64,${uint8ToBase64(bytes)}`;
    window.AndroidBridge.saveExportedFile(fileName, dataUrl);
    return;
  }
  const safeBytes = new Uint8Array(bytes.byteLength);
  safeBytes.set(bytes);
  const blob = new Blob([safeBytes.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportBookOrdersToExcel(
  orders: BookOrder[],
  allOrdersForStock: BookOrder[],
  stock: BookStockInventory,
  filterLabel: string
): string {
  const bytes = buildBookOrdersXlsxBytes(orders, allOrdersForStock, stock, filterLabel);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const fileName = `Book_Orders_${stamp}.xlsx`;
  triggerFileDownload(
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes
  );
  return fileName;
}

// ============================================================================
// High-DPI Gujarati-Native Canvas -> A4 PDF Exporter (Crisp Gujarati Unicode!)
// ============================================================================

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

export function exportBookOrdersToPdf(
  orders: BookOrder[],
  allOrdersForStock: BookOrder[],
  stock: BookStockInventory,
  filterLabel: string
): string {
  const pageWidthPx = 1190; // 2x A4 width (595pt)
  const pageHeightPx = 1684; // 2x A4 height (842pt)
  const marginX = 56;
  const contentWidth = pageWidthPx - marginX * 2;
  const fontFamily = '"Noto Sans Gujarati", "Shruti", system-ui, -apple-system, sans-serif';

  const filteredStats = computeBookOrderStats(orders, stock);
  const fullStats = computeBookOrderStats(allOrdersForStock, stock);
  const generatedAt = new Date().toLocaleString('en-IN');

  const firstPageRows = 16;
  const nextPageRows = 25;
  const pageSlices: Array<{ start: number; end: number }> = [];

  if (orders.length === 0) {
    pageSlices.push({ start: 0, end: 0 });
  } else {
    let idx = 0;
    while (idx < orders.length) {
      const cap = pageSlices.length === 0 ? firstPageRows : nextPageRows;
      const end = Math.min(idx + cap, orders.length);
      pageSlices.push({ start: idx, end });
      idx = end;
    }
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const colWidths = [56, 300, 175, 110, 88, 128, 115, 106]; // sum = 1078 == contentWidth
  const colHeaders = ['ક્રમ', 'ગ્રાહકનું નામ', 'વિષય', 'કિંમત', 'સંખ્યા', 'કુલ (₹)', 'પેમેન્ટ', 'તારીખ'];

  pageSlices.forEach((slice, pageIdx) => {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidthPx;
    canvas.height = pageHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PDF canvas initialize failed');

    // Pure white page background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

    let y = 44;

    // Header Banner
    drawRoundedRect(ctx, marginX, y, contentWidth, 94, 18);
    ctx.fillStyle = '#1E3A8A';
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 30px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('બુક ઓર્ડર મેનેજમેન્ટ રિપોર્ટ', marginX + 26, y + 34);

    ctx.fillStyle = '#DBEAFE';
    ctx.font = `600 18px ${fontFamily}`;
    ctx.fillText(`ફિલ્ટર: ${filterLabel}  •  તારીખ: ${generatedAt}`, marginX + 26, y + 68);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 18px ${fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(
      `પેજ ${pageIdx + 1} / ${pageSlices.length}`,
      marginX + contentWidth - 26,
      y + 47
    );

    y += 116;

    // Page 1: KPI Cards + Live Stock Table
    if (pageIdx === 0) {
      const kpiGap = 18;
      const kpiWidth = (contentWidth - kpiGap * 2) / 3;
      const kpiCards = [
        {
          title: 'કુલ ઓર્ડર',
          amount: `₹${filteredStats.totalAmount}`,
          sub: `${filteredStats.totalOrders} ઓર્ડર · ${filteredStats.totalBooks} બુક`,
          bg: '#F8FAFC',
          border: '#CBD5E1',
          color: '#0F172A',
        },
        {
          title: 'મળી ગયા (Done)',
          amount: `₹${filteredStats.doneAmount}`,
          sub: `${filteredStats.doneOrders} ઓર્ડર · ${filteredStats.doneBooks} બુક`,
          bg: '#ECFDF5',
          border: '#A7F3D0',
          color: '#047857',
        },
        {
          title: 'બાકી',
          amount: `₹${filteredStats.pendingAmount}`,
          sub: `${filteredStats.pendingOrders} ઓર્ડર · ${filteredStats.pendingBooks} બુક`,
          bg: '#FFFBEB',
          border: '#FDE68A',
          color: '#B45309',
        },
      ];

      kpiCards.forEach((card, i) => {
        const cx = marginX + i * (kpiWidth + kpiGap);
        drawRoundedRect(ctx, cx, y, kpiWidth, 120, 16);
        ctx.fillStyle = card.bg;
        ctx.fill();
        ctx.strokeStyle = card.border;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = `700 19px ${fontFamily}`;
        ctx.fillText(card.title, cx + kpiWidth / 2, y + 28);

        ctx.fillStyle = card.color;
        ctx.font = `800 34px ${fontFamily}`;
        ctx.fillText(card.amount, cx + kpiWidth / 2, y + 66);

        ctx.fillStyle = '#64748B';
        ctx.font = `600 17px ${fontFamily}`;
        ctx.fillText(card.sub, cx + kpiWidth / 2, y + 99);
      });

      y += 142;

      // Compact Stock Summary Box
      drawRoundedRect(ctx, marginX, y, contentWidth, 174, 16);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = `800 22px ${fontFamily}`;
      ctx.fillText('સ્ટોક વિગત (Live Stock)', marginX + 20, y + 30);

      const stockRows = [
        {
          name: 'ગણિત',
          detail: `ઓર્ડર: ${fullStats.orderedMaths} · કુલ સ્ટોક: ${stock.maths}`,
          right: `સ્ટોકમાં ${fullStats.inStockMaths}`,
          warn: fullStats.inStockMaths < 0,
        },
        {
          name: 'વિજ્ઞાન',
          detail: `ઓર્ડર: ${fullStats.orderedScience} · કુલ સ્ટોક: ${stock.science}`,
          right: `સ્ટોકમાં ${fullStats.inStockScience}`,
          warn: fullStats.inStockScience < 0,
        },
        {
          name: 'સામાજિક વિજ્ઞાન',
          detail: `ઓર્ડર: ${fullStats.orderedSocial} · કુલ સ્ટોક: ${stock.social_science}`,
          right: `સ્ટોકમાં ${fullStats.inStockSocial}`,
          warn: fullStats.inStockSocial < 0,
        },
        {
          name: 'કોમ્બો',
          detail: `ઓર્ડર: ${fullStats.orderedCombo}`,
          right: 'ત્રણેયમાંથી ઘટે',
          warn: false,
        },
      ];

      const colHalf = (contentWidth - 40) / 2;
      stockRows.forEach((sr, idx) => {
        const sx = marginX + 20 + (idx % 2) * (colHalf + 10);
        const sy = y + 58 + Math.floor(idx / 2) * 54;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = `700 18px ${fontFamily}`;
        ctx.fillText(sr.name, sx, sy + 8);

        ctx.fillStyle = '#64748B';
        ctx.font = `500 15px ${fontFamily}`;
        ctx.fillText(sr.detail, sx, sy + 32);

        ctx.textAlign = 'right';
        ctx.fillStyle = sr.warn ? '#DC2626' : '#047857';
        ctx.font = `800 18px ${fontFamily}`;
        ctx.fillText(sr.right, sx + colHalf - 16, sy + 18);
      });

      y += 196;
    }

    // Orders Table Header
    const rowH = 52;
    drawRoundedRect(ctx, marginX, y, contentWidth, rowH, 10);
    ctx.fillStyle = '#1E3A8A';
    ctx.fill();

    let cx = marginX;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 18px ${fontFamily}`;
    colHeaders.forEach((hdr, i) => {
      ctx.textAlign = i === 1 || i === 2 ? 'left' : 'center';
      const tx = i === 1 || i === 2 ? cx + 12 : cx + colWidths[i] / 2;
      ctx.fillText(hdr, tx, y + rowH / 2);
      cx += colWidths[i];
    });
    y += rowH;

    if (orders.length === 0) {
      ctx.fillStyle = '#64748B';
      ctx.font = `600 22px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText('આ ફિલ્ટરમાં કોઈ બુક ઓર્ડર ઉપલબ્ધ નથી.', marginX + contentWidth / 2, y + 60);
    } else {
      for (let i = slice.start; i < slice.end; i++) {
        const order = orders[i];
        const localIdx = i - slice.start;

        ctx.fillStyle = localIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.fillRect(marginX, y, contentWidth, rowH);

        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(marginX, y + rowH);
        ctx.lineTo(marginX + contentWidth, y + rowH);
        ctx.stroke();

        const isDone = order.paymentStatus === 'done';
        const rowValues = [
          String(i + 1),
          order.customerName,
          getBookSubjectLabel(order.subject),
          `₹${order.unitPrice}`,
          String(order.quantity),
          `₹${order.totalAmount}`,
          isDone ? '✓ Done' : 'બાકી',
          formatBookOrderDate(order),
        ];

        let rx = marginX;
        rowValues.forEach((val, colIdx) => {
          if (colIdx === 6) {
            // Pill badge for payment status
            const pillW = colWidths[colIdx] - 18;
            const pillH = 30;
            const px = rx + 9;
            const py = y + (rowH - pillH) / 2;
            drawRoundedRect(ctx, px, py, pillW, pillH, 15);
            ctx.fillStyle = isDone ? '#D1FAE5' : '#FEF3C7';
            ctx.fill();

            ctx.fillStyle = isDone ? '#047857' : '#B45309';
            ctx.font = `700 16px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(val, rx + colWidths[colIdx] / 2, y + rowH / 2);
          } else {
            ctx.fillStyle = colIdx === 5 ? '#0F172A' : '#334155';
            ctx.font = `${colIdx === 1 || colIdx === 5 ? 700 : 600} 17px ${fontFamily}`;
            const alignLeft = colIdx === 1 || colIdx === 2;
            ctx.textAlign = alignLeft ? 'left' : 'center';
            const displayVal = truncateText(ctx, val, colWidths[colIdx] - 18);
            const tx = alignLeft ? rx + 12 : rx + colWidths[colIdx] / 2;
            ctx.fillText(displayVal, tx, y + rowH / 2);
          }
          rx += colWidths[colIdx];
        });

        y += rowH;
      }
    }

    // Footer
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX, pageHeightPx - 64);
    ctx.lineTo(marginX + contentWidth, pageHeightPx - 64);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = `600 16px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('Quick Quiz • બુક ઓર્ડર મેનેજમેન્ટ', marginX, pageHeightPx - 36);
    ctx.textAlign = 'right';
    ctx.fillText(
      `કુલ ઓર્ડર: ${filteredStats.totalOrders}  •  કુલ રકમ: ₹${filteredStats.totalAmount}`,
      marginX + contentWidth,
      pageHeightPx - 36
    );

    if (pageIdx > 0) doc.addPage();
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, 595, 842);
  });

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const fileName = `Book_Orders_${stamp}.pdf`;

  if (typeof window !== 'undefined' && window.AndroidBridge?.saveExportedFile) {
    const dataUrl = doc.output('datauristring');
    window.AndroidBridge.saveExportedFile(fileName, dataUrl);
    return fileName;
  }

  doc.save(fileName);
  return fileName;
}
