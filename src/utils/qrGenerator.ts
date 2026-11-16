// Zero-dependency ISO/IEC 18004 QR Code Generator (Byte Mode, Error Correction Level M)
// Supports Versions 1–14 (up to ~350 UTF-8 bytes) for offline UPI QR rendering.

interface VersionSpec {
  version: number;
  size: number;
  totalCodewords: number;
  ecPerBlock: number;
  blocks: Array<[number, number]>; // [count, dataCodewords]
  alignmentCoords: number[];
  remainderBits: number;
}

const VERSIONS: VersionSpec[] = [
  { version: 1, size: 21, totalCodewords: 26, ecPerBlock: 10, blocks: [[1, 16]], alignmentCoords: [], remainderBits: 0 },
  { version: 2, size: 25, totalCodewords: 44, ecPerBlock: 16, blocks: [[1, 28]], alignmentCoords: [6, 18], remainderBits: 7 },
  { version: 3, size: 29, totalCodewords: 70, ecPerBlock: 26, blocks: [[1, 44]], alignmentCoords: [6, 22], remainderBits: 7 },
  { version: 4, size: 33, totalCodewords: 100, ecPerBlock: 18, blocks: [[2, 32]], alignmentCoords: [6, 26], remainderBits: 7 },
  { version: 5, size: 37, totalCodewords: 134, ecPerBlock: 24, blocks: [[2, 43]], alignmentCoords: [6, 30], remainderBits: 7 },
  { version: 6, size: 41, totalCodewords: 172, ecPerBlock: 16, blocks: [[4, 27]], alignmentCoords: [6, 34], remainderBits: 7 },
  { version: 7, size: 45, totalCodewords: 196, ecPerBlock: 18, blocks: [[4, 31]], alignmentCoords: [6, 22, 38], remainderBits: 0 },
  { version: 8, size: 49, totalCodewords: 242, ecPerBlock: 22, blocks: [[2, 38], [2, 39]], alignmentCoords: [6, 24, 42], remainderBits: 0 },
  { version: 9, size: 53, totalCodewords: 292, ecPerBlock: 22, blocks: [[3, 36], [2, 37]], alignmentCoords: [6, 26, 46], remainderBits: 0 },
  { version: 10, size: 57, totalCodewords: 346, ecPerBlock: 26, blocks: [[4, 43], [1, 44]], alignmentCoords: [6, 28, 50], remainderBits: 0 },
  { version: 11, size: 61, totalCodewords: 404, ecPerBlock: 30, blocks: [[1, 50], [4, 51]], alignmentCoords: [6, 30, 54], remainderBits: 0 },
  { version: 12, size: 65, totalCodewords: 466, ecPerBlock: 22, blocks: [[6, 36], [2, 37]], alignmentCoords: [6, 32, 58], remainderBits: 0 },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGenerator(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

function encodeFormatInfo(maskPattern: number): number {
  // EC Level M = 00
  const data = (0b00 << 3) | (maskPattern & 0b111);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function encodeVersionInfo(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

export function generateQrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);

  let spec: VersionSpec | null = null;
  for (const candidate of VERSIONS) {
    const totalDataCodewords = candidate.blocks.reduce((s, [c, d]) => s + c * d, 0);
    const countBits = candidate.version >= 10 ? 16 : 8;
    const neededBits = 4 + countBits + bytes.length * 8;
    if (neededBits <= totalDataCodewords * 8) {
      spec = candidate;
      break;
    }
  }
  if (!spec) {
    throw new Error('QR payload exceeds supported length');
  }

  const totalDataCodewords = spec.blocks.reduce((s, [c, d]) => s + c * d, 0);
  const countBits = spec.version >= 10 ? 16 : 8;

  // 1. Build bit stream (Byte mode 0100)
  const bitBuf: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >>> i) & 1);
    }
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, countBits);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = totalDataCodewords * 8;
  const termLen = Math.min(4, maxBits - bitBuf.length);
  pushBits(0, termLen);
  while (bitBuf.length % 8 !== 0) bitBuf.push(0);

  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bitBuf.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | bitBuf[i + j];
    dataCodewords[i >>> 3] = val;
  }
  let padIdx = bitBuf.length >>> 3;
  let toggle = true;
  while (padIdx < totalDataCodewords) {
    dataCodewords[padIdx++] = toggle ? 0xec : 0x11;
    toggle = !toggle;
  }

  // 2. Split into RS blocks & interleave
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, dcLen] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const slice = dataCodewords.slice(offset, offset + dcLen);
      offset += dcLen;
      dataBlocks.push(slice);
      ecBlocks.push(computeRsEc(slice, spec.ecPerBlock));
    }
  }

  const interleavedBits: number[] = [];
  const pushByte = (b: number) => {
    for (let i = 7; i >= 0; i--) interleavedBits.push((b >>> i) & 1);
  };
  const maxDcLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDcLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) pushByte(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of ecBlocks) pushByte(blk[i]);
  }
  for (let i = 0; i < spec.remainderBits; i++) interleavedBits.push(0);

  // 3. Place function patterns
  const n = spec.size;
  const grid: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const isFunc: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= n || c < 0 || c >= n) return;
    grid[r][c] = dark;
    isFunc[r][c] = true;
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        const dark = dist !== 2 && dist !== 4;
        setFunc(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Alignment patterns
  const coords = spec.alignmentCoords;
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === coords.length - 1) ||
        (i === coords.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = coords[i];
      const cc = coords[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    const dark = i % 2 === 0;
    if (!isFunc[6][i]) setFunc(6, i, dark);
    if (!isFunc[i][6]) setFunc(i, 6, dark);
  }

  // Dark module + reserve format info
  setFunc(n - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][n - 1 - i]) setFunc(8, n - 1 - i, false);
  }
  for (let i = 0; i < 7; i++) {
    if (!isFunc[n - 1 - i][8]) setFunc(n - 1 - i, 8, false);
  }

  // Version info for >= 7
  if (spec.version >= 7) {
    const vBits = encodeVersionInfo(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + n - 11;
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // 4. Zigzag data placement
  let bitIdx = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (!isFunc[r][c]) {
          grid[r][c] = bitIdx < interleavedBits.length && interleavedBits[bitIdx] === 1;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // 5. Evaluate 8 mask patterns & choose lowest penalty
  const maskFns: Array<(r: number, c: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const applyMaskAndFormat = (maskIdx: number): boolean[][] => {
    const out = grid.map((row) => row.slice());
    const fn = maskFns[maskIdx];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!isFunc[r][c] && fn(r, c)) {
          out[r][c] = !out[r][c];
        }
      }
    }
    const fmt = encodeFormatInfo(maskIdx);
    const fmtBit = (idxFromMsb: number) => ((fmt >>> (14 - idxFromMsb)) & 1) === 1;
    // Copy 1: top-left (MSB=0 at (8,0) .. LSB=14 at (0,8))
    for (let i = 0; i < 6; i++) out[8][i] = fmtBit(i);
    out[8][7] = fmtBit(6);
    out[8][8] = fmtBit(7);
    out[7][8] = fmtBit(8);
    for (let i = 0; i < 6; i++) out[5 - i][8] = fmtBit(9 + i);

    // Copy 2: bottom-left (bits 0..6) & top-right (bits 7..14)
    for (let i = 0; i < 7; i++) out[n - 1 - i][8] = fmtBit(i);
    for (let i = 0; i < 8; i++) out[8][n - 8 + i] = fmtBit(7 + i);
    return out;
  };

  const scorePenalty = (m: boolean[][]): number => {
    let penalty = 0;
    // Rule 1: 5+ consecutive same color in row/col
    for (let r = 0; r < n; r++) {
      let runLen = 1;
      for (let c = 1; c < n; c++) {
        if (m[r][c] === m[r][c - 1]) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    for (let c = 0; c < n; c++) {
      let runLen = 1;
      for (let r = 1; r < n; r++) {
        if (m[r][c] === m[r - 1][c]) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    // Rule 2: 2x2 blocks
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = m[r][c];
        if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) {
          penalty += 3;
        }
      }
    }
    // Rule 4: dark ratio
    let darkCount = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (m[r][c]) darkCount++;
    }
    const pct = (darkCount * 100) / (n * n);
    penalty += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return penalty;
  };

  let bestMask = 0;
  let bestScore = Number.MAX_SAFE_INTEGER;
  let bestModules: boolean[][] = grid;
  for (let m = 0; m < 8; m++) {
    const candidate = applyMaskAndFormat(m);
    const sc = scorePenalty(candidate);
    if (sc < bestScore) {
      bestScore = sc;
      bestMask = m;
      bestModules = candidate;
    }
  }
  void bestMask;

  return { size: n, modules: bestModules };
}

export function renderQrToPngDataUrl(
  qrPayload: string,
  titleLine: string,
  amountLabel: string
): string {
  const { size, modules } = generateQrMatrix(qrPayload);
  const scale = 8;
  const quiet = 4;
  const qrPx = (size + quiet * 2) * scale;
  const padX = 28;
  const topHeaderH = 66;
  const bottomFooterH = 44;
  const w = qrPx + padX * 2;
  const h = qrPx + topHeaderH + bottomFooterH;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 18px "Anek Gujarati", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titleLine, w / 2, 30);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px "Anek Gujarati", sans-serif';
  ctx.fillText(amountLabel, w / 2, 56);

  const offsetX = padX + quiet * scale;
  const offsetY = topHeaderH + quiet * scale;
  ctx.fillStyle = '#000000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        ctx.fillRect(offsetX + c * scale, offsetY + r * scale, scale, scale);
      }
    }
  }

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 14px "Anek Gujarati", sans-serif';
  ctx.fillText('GPay / PhonePe / Paytm → Scan QR from Gallery', w / 2, h - 18);

  return canvas.toDataURL('image/png');
}
