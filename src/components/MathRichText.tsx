import React from 'react';

type MathNode =
  | { kind: 'plain'; text: string }
  | { kind: 'sup'; nodes: MathNode[] }
  | { kind: 'sub'; nodes: MathNode[] }
  | { kind: 'overbar'; nodes: MathNode[] }
  | { kind: 'sqrt'; indexNodes?: MathNode[]; inner: MathNode[] }
  | { kind: 'frac'; numerator: MathNode[]; denominator: MathNode[] };

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

const UNIT_RATIO_SET = new Set(['m/s', 'cm/s', 'km/s', 'km/h', 'j/s', 'n/m', 'kg/m', 'm/sec']);

function normalizeMathMacros(raw: string): string {
  let out = raw
    .replace(/\\overline\s*\{/g, '\\bar{')
    .replace(/\\dfrac\s*\{/g, '\\frac{')
    .replace(/\\tfrac\s*\{/g, '\\frac{')
    .replace(/\^\{\\circ\}|\^\\circ|\\degree|\\circ/g, '°')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\neq/g, '≠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\angle/g, '∠')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '∥')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\cdot/g, '·')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']')
    .replace(/\\,/g, ' ');

  // Convert Unicode superscript runs (e.g. 10⁸, cm²) -> ^{...}
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (seq) => {
    const mapped = Array.from(seq, (c) => SUPERSCRIPT_MAP[c] ?? c).join('');
    return `^{${mapped}}`;
  });

  // Convert Unicode subscript runs (e.g. H₂O, CO₂) -> _{...}
  out = out.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (seq) => {
    const mapped = Array.from(seq, (c) => SUBSCRIPT_MAP[c] ?? c).join('');
    return `_{${mapped}}`;
  });

  // Normalize unbraced multi-letter subscript like R_eq -> R_{eq}
  out = out.replace(/([A-Za-z0-9])_([A-Za-z]{2,})\b/g, '$1_{$2}');

  // Convert bare √(expr) and √D / √5 into \sqrt{...}
  out = out.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  out = out.replace(/√([A-Za-z0-9]+)/g, '\\sqrt{$1}');

  // Convert math slash fractions like 1/f, R/2, V^2/R, h'/h -> \frac{...}{...}
  // while keeping unit ratios like m/s, km/h, cm/s inline.
  out = out.replace(
    /(?<![A-Za-z0-9/\\])([A-Za-z0-9']+(?:\^(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]))?)\/([A-Za-z0-9]+)(?![A-Za-z0-9/])/g,
    (full, num: string, den: string) => {
      if (UNIT_RATIO_SET.has(full.toLowerCase())) return full;
      if (/^\d{4}$/.test(den)) return full;
      return `\\frac{${num}}{${den}}`;
    }
  );

  return out;
}

function parseUntil(
  input: string,
  startIndex: number,
  stopChar: string | null
): [MathNode[], number] {
  const nodes: MathNode[] = [];
  let textBuffer = '';
  let index = startIndex;

  const flushPlain = () => {
    if (textBuffer.length > 0) {
      nodes.push({ kind: 'plain', text: textBuffer });
      textBuffer = '';
    }
  };

  while (index < input.length) {
    const ch = input[index];
    if (stopChar !== null && ch === stopChar) {
      flushPlain();
      return [nodes, index + 1];
    }

    if (input.startsWith('\\frac{', index)) {
      flushPlain();
      const [num, afterNum] = parseBracedGroup(input, index + 5);
      const [den, afterDen] =
        afterNum < input.length && input[afterNum] === '{'
          ? parseBracedGroup(input, afterNum)
          : [[{ kind: 'plain', text: '' } as MathNode], afterNum];
      nodes.push({ kind: 'frac', numerator: num, denominator: den });
      index = afterDen;
    } else if (input.startsWith('\\sqrt[', index)) {
      flushPlain();
      const [indexNodes, afterIndex] = parseUntil(input, index + 6, ']');
      if (afterIndex < input.length && input[afterIndex] === '{') {
        const [inner, nextIdx] = parseBracedGroup(input, afterIndex);
        nodes.push({ kind: 'sqrt', indexNodes, inner });
        index = nextIdx;
      } else {
        nodes.push({ kind: 'sqrt', indexNodes, inner: [] });
        index = afterIndex;
      }
    } else if (input.startsWith('\\sqrt{', index)) {
      flushPlain();
      const [inner, nextIdx] = parseBracedGroup(input, index + 5);
      nodes.push({ kind: 'sqrt', inner });
      index = nextIdx;
    } else if (input.startsWith('\\bar{', index)) {
      flushPlain();
      const [inner, nextIdx] = parseBracedGroup(input, index + 4);
      nodes.push({ kind: 'overbar', nodes: inner });
      index = nextIdx;
    } else if (ch === '^') {
      flushPlain();
      if (index + 1 < input.length && input[index + 1] === '{') {
        const [inner, nextIdx] = parseBracedGroup(input, index + 1);
        nodes.push({ kind: 'sup', nodes: inner });
        index = nextIdx;
      } else if (index + 1 < input.length) {
        nodes.push({ kind: 'sup', nodes: [{ kind: 'plain', text: input[index + 1] }] });
        index += 2;
      } else {
        textBuffer += ch;
        index += 1;
      }
    } else if (
      ch === '_' &&
      index + 1 < input.length &&
      (input[index + 1] === '{' || /[A-Za-z0-9]/.test(input[index + 1]))
    ) {
      flushPlain();
      if (input[index + 1] === '{') {
        const [inner, nextIdx] = parseBracedGroup(input, index + 1);
        nodes.push({ kind: 'sub', nodes: inner });
        index = nextIdx;
      } else {
        nodes.push({ kind: 'sub', nodes: [{ kind: 'plain', text: input[index + 1] }] });
        index += 2;
      }
    } else {
      textBuffer += ch;
      index += 1;
    }
  }

  flushPlain();
  return [nodes, index];
}

function parseBracedGroup(input: string, openBraceIndex: number): [MathNode[], number] {
  if (openBraceIndex >= input.length || input[openBraceIndex] !== '{') {
    return [[], openBraceIndex];
  }
  return parseUntil(input, openBraceIndex + 1, '}');
}

const UPRIGHT_WORDS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'cosec',
  'csc',
  'log',
  'eq',
  'cm',
  'km',
  'mm',
  'kg',
  'mg',
  'ml',
  'm',
  's',
  'g',
  'Hz',
  'HCF',
  'LCM',
  'Na',
  'Ca',
  'OH',
  'SO',
  'NO',
  'CO',
  'Fe',
  'Zn',
  'Cu',
  'Mg',
  'Al',
  'Cl',
  'pH',
  'V',
  'A',
  'W',
  'J',
]);

// Format tokens inside an equation span into upright numbers, italic variables, and operators
function renderEquationTokens(expr: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex =
    /(\d+(?:\.\d+)?|[A-Za-z]+|[=≠≤≥<>+\-×÷±≈∞∝⇒→↑∠⊥∥ΔθπαβγΩ°·()[\],:/%]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let partIdx = 0;

  while ((match = tokenRegex.exec(expr)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        <React.Fragment key={`${keyPrefix}_raw_${partIdx++}`}>
          {expr.slice(lastIdx, match.index)}
        </React.Fragment>
      );
    }

    const tok = match[0];
    const prevSlice = expr.slice(0, match.index);
    if (/^\d/.test(tok)) {
      parts.push(
        <span key={`${keyPrefix}_num_${partIdx++}`} className="math-num">
          {tok}
        </span>
      );
    } else if (/^[A-Za-z]+$/.test(tok)) {
      const precededBySpaceAndDigit = /\d\s+$/.test(prevSlice);
      if (
        UPRIGHT_WORDS.has(tok) &&
        (tok.length > 1 || precededBySpaceAndDigit)
      ) {
        parts.push(
          <span key={`${keyPrefix}_fn_${partIdx++}`} className="math-op">
            {tok}
          </span>
        );
      } else if (tok.length <= 3) {
        parts.push(
          <span key={`${keyPrefix}_var_${partIdx++}`} className="math-var">
            {tok}
          </span>
        );
      } else {
        parts.push(<React.Fragment key={`${keyPrefix}_word_${partIdx++}`}>{tok}</React.Fragment>);
      }
    } else {
      parts.push(
        <span key={`${keyPrefix}_op_${partIdx++}`} className="math-op">
          {tok}
        </span>
      );
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < expr.length) {
    parts.push(
      <React.Fragment key={`${keyPrefix}_tail_${partIdx}`}>{expr.slice(lastIdx)}</React.Fragment>
    );
  }
  return parts;
}

// Keep Gujarati prose, question prefixes ("12)"), "સ્ટેપ 1:", and board dates "(March-2026)" in Anek Gujarati,
// while rendering math equations, math symbols, variables, and numeric values in Equation Format.
const SKIP_OR_MATH_SEGMENT_REGEX =
  /(^\s*\d+\)\s*|સ્ટેપ\s+\d+\s*:|\((?:March|June|July|May|Aug|Sample)[^)]*\)|\([A-D]\)|_{3,}|(?:∠|Δ|θ|π|α|β|γ|Ω|±|≠|≤|≥|=|<|>|≈|∞|∝|⇒|→|↑|⊥|∥|×|÷|·|[+\-−]?\d+(?:\.\d+)?(?:\s*[A-Za-z°%]+)?|[A-Za-z]+(?:\s*\([A-Za-z0-9,\s+-]+\))?)(?:\s*(?:[=≠≤≥<>+\-×÷±≈⇒→·:/]|°|%)\s*(?:∠|Δ|θ|π|α|β|γ|Ω|±|≠|≤|≥|≈|∞|∝|⇒|→|↑|⊥|∥|×|÷|·|\d+(?:\.\d+)?|[A-Za-z0-9()[\]°%.'+-]+))*)/g;

type RenderPiece =
  | { kind: 'prose'; text: string }
  | { kind: 'glue'; text: string }
  | { kind: 'eq'; text: string }
  | { kind: 'node'; node: MathNode };

function splitPlainToPieces(text: string): RenderPiece[] {
  const pieces: RenderPiece[] = [];
  let lastIdx = 0;
  SKIP_OR_MATH_SEGMENT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushProseOrGlue = (rawSlice: string) => {
    if (!rawSlice) return;
    if (/^[ \t()[\]+=\-−×÷·<>≠≤≥±≈]+$/.test(rawSlice)) {
      pieces.push({ kind: 'glue', text: rawSlice });
    } else {
      pieces.push({ kind: 'prose', text: rawSlice });
    }
  };

  while ((match = SKIP_OR_MATH_SEGMENT_REGEX.exec(text)) !== null) {
    if (match.index > lastIdx) {
      pushProseOrGlue(text.slice(lastIdx, match.index));
    }

    const seg = match[0];
    const isSkippedMeta =
      /^\s*\d+\)\s*$/.test(seg) ||
      /^સ્ટેપ\s+\d+\s*:$/.test(seg) ||
      /^\((?:March|June|July|May|Aug|Sample)/.test(seg) ||
      /^\([A-D]\)$/.test(seg) ||
      /^_{3,}$/.test(seg);

    const hasMathSignal =
      /[\d=≠≤≥<>+\-×÷±≈∞∝⇒→↑∠⊥∥ΔθπαβγΩ°·%√:/]/.test(seg) ||
      /^(?:[a-zA-Z]|[a-zA-Z]\s*\([a-zA-Z0-9,\s+-]+\)|(?:sin|cos|tan|cot|sec|cosec|csc)\b)/.test(
        seg.trim()
      );

    if (isSkippedMeta || !hasMathSignal) {
      pieces.push({ kind: 'prose', text: seg });
    } else if (/^[ \t]*⇒[ \t]*$/.test(seg)) {
      pieces.push({ kind: 'prose', text: seg });
    } else {
      const leadSpace = seg.match(/^[ \t]+/)?.[0] ?? '';
      const trailSpace = seg.match(/[ \t]+$/)?.[0] ?? '';
      const core = seg.slice(leadSpace.length, seg.length - trailSpace.length);
      if (leadSpace) pieces.push({ kind: 'glue', text: leadSpace });
      if (core) {
        if (/^⇒/.test(core)) {
          pieces.push({ kind: 'prose', text: '⇒ ' });
          const rest = core.replace(/^⇒\s*/, '');
          if (rest) pieces.push({ kind: 'eq', text: rest });
        } else {
          pieces.push({ kind: 'eq', text: core });
        }
      }
      if (trailSpace) pieces.push({ kind: 'glue', text: trailSpace });
    }

    lastIdx = SKIP_OR_MATH_SEGMENT_REGEX.lastIndex;
  }

  if (lastIdx < text.length) {
    pushProseOrGlue(text.slice(lastIdx));
  }

  return pieces;
}

function renderSingleNode(node: MathNode, key: string, nestedFraction = false): React.ReactNode {
  switch (node.kind) {
    case 'plain':
      return <span className="math-eq">{renderEquationTokens(node.text, key)}</span>;
    case 'sup':
      return (
        <sup key={key} className="math-eq text-[0.74em] leading-none align-super">
          {renderNodesInline(node.nodes, key, nestedFraction)}
        </sup>
      );
    case 'sub':
      return (
        <sub key={key} className="math-eq text-[0.74em] leading-none align-sub">
          {renderNodesInline(node.nodes, key, nestedFraction)}
        </sub>
      );
    case 'overbar':
      return (
        <span
          key={key}
          className="math-eq inline-block border-t border-current pt-[2px] mt-[2px] mx-[1px] leading-[1.2]"
        >
          {renderNodesInline(node.nodes, `${key}_ob`, nestedFraction)}
        </span>
      );
    case 'sqrt':
      return (
        <span
          key={key}
          className="math-eq inline-flex items-baseline mx-[2px] py-[2px] whitespace-nowrap"
        >
          {node.indexNodes && node.indexNodes.length > 0 && (
            <sup className="text-[0.65em] leading-none mr-[1px]">
              {renderNodesInline(node.indexNodes, `${key}_idx`, nestedFraction)}
            </sup>
          )}
          <span className="text-[1.12em] font-medium leading-none">√</span>
          <span className="border-t border-current px-[3px] pt-[2px] leading-[1.2]">
            {renderNodesInline(node.inner, key, nestedFraction)}
          </span>
        </span>
      );
    case 'frac':
      return (
        <span
          key={key}
          className={`math-eq inline-flex flex-col items-center justify-center align-middle mx-1 py-[2px] whitespace-nowrap ${
            nestedFraction ? 'text-[0.86em] leading-[1.15]' : 'text-[0.88em] leading-[1.2]'
          }`}
        >
          <span className="px-1.5 border-b border-current pb-[2px]">
            {renderNodesInline(node.numerator, `${key}_n`, true)}
          </span>
          <span className="px-1.5 pt-[2px]">
            {renderNodesInline(node.denominator, `${key}_d`, true)}
          </span>
        </span>
      );
  }
}

function renderNodesInline(
  nodes: MathNode[],
  keyPrefix = 'm',
  nestedFraction = false
): React.ReactNode[] {
  return nodes.map((node, idx) => (
    <React.Fragment key={`${keyPrefix}_${idx}`}>
      {renderSingleNode(node, `${keyPrefix}_${idx}`, nestedFraction)}
    </React.Fragment>
  ));
}

function isComplexMathRun(pieces: RenderPiece[]): boolean {
  if (pieces.length > 1) return true;
  for (const p of pieces) {
    if (p.kind === 'node') {
      if (p.node.kind === 'frac' || p.node.kind === 'sqrt' || p.node.kind === 'overbar') {
        return true;
      }
    } else if (p.kind === 'eq') {
      if (/[=≠≤≥<>+\-×÷±≈⇒→∠⊥∥/]/.test(p.text) || p.text.length >= 6) {
        return true;
      }
    }
  }
  return false;
}

function renderTopLevelNodes(nodes: MathNode[], keyPrefix = 'm'): React.ReactNode[] {
  const flatPieces: RenderPiece[] = [];
  for (const node of nodes) {
    if (node.kind === 'plain') {
      flatPieces.push(...splitPlainToPieces(node.text));
    } else {
      flatPieces.push({ kind: 'node', node });
    }
  }

  const out: React.ReactNode[] = [];
  let mathRun: RenderPiece[] = [];
  let pendingGlue: RenderPiece[] = [];
  let outIdx = 0;

  const renderPieceNode = (p: RenderPiece, k: string): React.ReactNode => {
    if (p.kind === 'node') {
      return renderSingleNode(p.node, k, false);
    }
    if (p.kind === 'eq') {
      return (
        <span key={k} className="math-eq">
          {renderEquationTokens(p.text, `${k}_tok`)}
        </span>
      );
    }
    return <React.Fragment key={k}>{p.text}</React.Fragment>;
  };

  const flushMathRun = () => {
    if (mathRun.length > 0) {
      const k = `${keyPrefix}_run_${outIdx++}`;
      const children = mathRun.map((p, idx) => (
        <React.Fragment key={`${k}_${idx}`}>{renderPieceNode(p, `${k}_${idx}`)}</React.Fragment>
      ));
      if (isComplexMathRun(mathRun)) {
        out.push(
          <span key={k} className="math-formula-line math-eq">
            {children}
          </span>
        );
      } else {
        out.push(
          <span key={k} className="inline whitespace-nowrap">
            {children}
          </span>
        );
      }
      mathRun = [];
    }
    if (pendingGlue.length > 0) {
      for (const g of pendingGlue) {
        out.push(
          <React.Fragment key={`${keyPrefix}_gl_${outIdx++}`}>
            {g.kind !== 'node' ? g.text : null}
          </React.Fragment>
        );
      }
      pendingGlue = [];
    }
  };

  for (const piece of flatPieces) {
    if (piece.kind === 'prose') {
      flushMathRun();
      out.push(<React.Fragment key={`${keyPrefix}_pr_${outIdx++}`}>{piece.text}</React.Fragment>);
    } else if (piece.kind === 'glue') {
      if (mathRun.length > 0) {
        pendingGlue.push(piece);
      } else {
        out.push(<React.Fragment key={`${keyPrefix}_gl_${outIdx++}`}>{piece.text}</React.Fragment>);
      }
    } else {
      if (pendingGlue.length > 0) {
        mathRun.push(...pendingGlue);
        pendingGlue = [];
      }
      mathRun.push(piece);
    }
  }
  flushMathRun();

  return out;
}

const UNDERLINE_TAG_REGEX = /(\[\[u\]\][\s\S]*?\[\[\/u\]\])/g;

function renderPlainWithUnderlines(text: string): React.ReactNode[] {
  const parts = text.split(UNDERLINE_TAG_REGEX);
  return parts.map((part, idx) => {
    if (part.startsWith('[[u]]') && part.endsWith('[[/u]]')) {
      const inner = part.slice(5, -6);
      return (
        <span
          key={`u_${idx}`}
          className="underline decoration-2 decoration-[#0F766E] dark:decoration-[#5EEAD4] underline-offset-4 font-extrabold text-[#0F172A] dark:text-[#F8FAFC] bg-[#CCFBF1]/45 dark:bg-[#134E4A]/45 px-1 rounded"
        >
          {inner}
        </span>
      );
    }
    return <React.Fragment key={`t_${idx}`}>{part}</React.Fragment>;
  });
}

interface MathRichTextProps {
  text: string;
  className?: string;
  plainText?: boolean;
}

export const MathRichText: React.FC<MathRichTextProps> = ({
  text,
  className = '',
  plainText = false,
}) => {
  const hasUnderlineTag = text.includes('[[u]]');
  const [nodes] = React.useMemo(() => {
    if (plainText || hasUnderlineTag) return [[] as MathNode[], 0] as const;
    const normalized = normalizeMathMacros(text);
    return parseUntil(normalized, 0, null);
  }, [text, plainText, hasUnderlineTag]);

  if (plainText || hasUnderlineTag) {
    return (
      <span className={`inline leading-[inherit] ${className}`}>
        {renderPlainWithUnderlines(text)}
      </span>
    );
  }

  return (
    <span className={`inline leading-[inherit] ${className}`}>
      {renderTopLevelNodes(nodes)}
    </span>
  );
};
