import React from 'react';

type MathNode =
  | { kind: 'plain'; text: string }
  | { kind: 'sup'; nodes: MathNode[] }
  | { kind: 'sub'; nodes: MathNode[] }
  | { kind: 'overbar'; nodes: MathNode[] }
  | { kind: 'sqrt'; indexNodes?: MathNode[]; inner: MathNode[] }
  | { kind: 'frac'; numerator: MathNode[]; denominator: MathNode[] };

function normalizeMathMacros(raw: string): string {
  return raw
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

function renderNodes(nodes: MathNode[], keyPrefix = 'm'): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}_${idx}`;
    switch (node.kind) {
      case 'plain':
        return <React.Fragment key={key}>{node.text}</React.Fragment>;
      case 'sup':
        return (
          <sup key={key} className="text-[0.74em] leading-none align-super">
            {renderNodes(node.nodes, key)}
          </sup>
        );
      case 'sub':
        return (
          <sub key={key} className="text-[0.74em] leading-none align-sub">
            {renderNodes(node.nodes, key)}
          </sub>
        );
      case 'overbar':
        return (
          <span
            key={key}
            className="inline-block border-t border-current pt-[2px] mt-[2px] mx-[1px] leading-[1.2]"
          >
            {renderNodes(node.nodes, `${key}_ob`)}
          </span>
        );
      case 'sqrt':
        return (
          <span key={key} className="inline-flex items-baseline mx-[2px] py-[2px] whitespace-nowrap">
            {node.indexNodes && node.indexNodes.length > 0 && (
              <sup className="text-[0.65em] leading-none mr-[1px]">
                {renderNodes(node.indexNodes, `${key}_idx`)}
              </sup>
            )}
            <span className="text-[1.08em] font-medium leading-none">√</span>
            <span className="border-t border-current px-[3px] pt-[2px] leading-[1.2]">
              {renderNodes(node.inner, key)}
            </span>
          </span>
        );
      case 'frac':
        return (
          <span
            key={key}
            className="inline-flex flex-col items-center justify-center align-middle mx-1 my-0.5 py-0.5 text-[0.88em] leading-[1.25] whitespace-nowrap"
          >
            <span className="px-1.5 border-b border-current pb-[2px]">
              {renderNodes(node.numerator, `${key}_n`)}
            </span>
            <span className="px-1.5 pt-[2px]">
              {renderNodes(node.denominator, `${key}_d`)}
            </span>
          </span>
        );
    }
  });
}

interface MathRichTextProps {
  text: string;
  className?: string;
}

export const MathRichText: React.FC<MathRichTextProps> = ({ text, className = '' }) => {
  const [nodes] = React.useMemo(() => {
    const normalized = normalizeMathMacros(text);
    return parseUntil(normalized, 0, null);
  }, [text]);
  return <span className={`inline leading-[inherit] ${className}`}>{renderNodes(nodes)}</span>;
};
