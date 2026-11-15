import React from 'react';

type MathNode =
  | { kind: 'plain'; text: string }
  | { kind: 'sup'; nodes: MathNode[] }
  | { kind: 'sub'; nodes: MathNode[] }
  | { kind: 'overbar'; content: string }
  | { kind: 'sqrt'; inner: MathNode[] }
  | { kind: 'frac'; numerator: MathNode[]; denominator: MathNode[] };

function readRawBracedText(input: string, openBraceIndex: number): [string, number] {
  if (openBraceIndex >= input.length || input[openBraceIndex] !== '{') {
    return ['', openBraceIndex];
  }
  let depth = 0;
  let i = openBraceIndex;
  let out = '';
  while (i < input.length) {
    const c = input[i];
    if (c === '{') {
      if (depth > 0) out += c;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return [out, i + 1];
      out += c;
    } else {
      out += c;
    }
    i++;
  }
  return [out, i];
}

function parseUntil(input: string, startIndex: number, stopChar: string | null): [MathNode[], number] {
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
    } else if (input.startsWith('\\sqrt{', index)) {
      flushPlain();
      const [inner, nextIdx] = parseBracedGroup(input, index + 5);
      nodes.push({ kind: 'sqrt', inner });
      index = nextIdx;
    } else if (input.startsWith('\\bar{', index)) {
      flushPlain();
      const [innerText, nextIdx] = readRawBracedText(input, index + 4);
      nodes.push({ kind: 'overbar', content: innerText });
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
            className="inline-block border-t border-current pt-[1px] mx-[1px] leading-tight"
          >
            {node.content}
          </span>
        );
      case 'sqrt':
        return (
          <span key={key} className="inline-flex items-baseline mx-[1px]">
            <span className="text-[1.06em] font-medium leading-none">√</span>
            <span className="border-t border-current px-[2px] pt-[1px] leading-tight">
              {renderNodes(node.inner, key)}
            </span>
          </span>
        );
      case 'frac':
        return (
          <span
            key={key}
            className="inline-flex flex-col items-center justify-center align-middle mx-1 text-[0.86em] leading-tight"
          >
            <span className="px-1 border-b border-current pb-[1px]">
              {renderNodes(node.numerator, `${key}_n`)}
            </span>
            <span className="px-1 pt-[1px]">
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
  const [nodes] = React.useMemo(() => parseUntil(text, 0, null), [text]);
  return <span className={className}>{renderNodes(nodes)}</span>;
};
