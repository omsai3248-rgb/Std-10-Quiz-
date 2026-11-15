import React from 'react';
import type { PolynomialGraphPattern } from '../types/models';

interface PolynomialGraphCardProps {
  pattern: PolynomialGraphPattern;
}

export const PolynomialGraphCard: React.FC<PolynomialGraphCardProps> = ({ pattern }) => {
  const width = 360;
  const height = 200;
  const cx = width / 2;
  const cy = height / 2;
  const unit = Math.min(width, height) / 6;
  const scale = Math.min(width, height) / 5.4;

  const toScreen = (mx: number, my: number): [number, number] => [cx + mx * scale, cy - my * scale];

  const buildSampledXY = (xStart: number, xEnd: number, fn: (x: number) => number): string => {
    const steps = 100;
    let d = '';
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const mx = xStart + (xEnd - xStart) * (i / steps);
      const my = fn(mx);
      const [px, py] = toScreen(mx, my);
      if (py >= 6 && py <= height - 6) {
        d += `${started ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)} `;
        started = true;
      } else if (started) {
        const clampedY = Math.max(6, Math.min(height - 6, py));
        d += `L${px.toFixed(1)},${clampedY.toFixed(1)} `;
      }
    }
    return d.trim();
  };

  const buildSampledYX = (yStart: number, yEnd: number, fn: (y: number) => number): string => {
    const steps = 100;
    let d = '';
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const my = yStart + (yEnd - yStart) * (i / steps);
      const mx = fn(my);
      const [px, py] = toScreen(mx, my);
      if (px >= 10 && px <= width - 10) {
        d += `${started ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)} `;
        started = true;
      } else if (started) {
        const clampedX = Math.max(10, Math.min(width - 10, px));
        d += `L${clampedX.toFixed(1)},${py.toFixed(1)} `;
      }
    }
    return d.trim();
  };

  let pathD = '';
  let dots: Array<[number, number]> = [];
  let verticalLine: { x1: number; y1: number; x2: number; y2: number } | null = null;

  switch (pattern) {
    case 'Q01_X_EQ_PY_ONE_Y_TOUCH':
      pathD = buildSampledYX(-0.2, 2.4, (y) => 1.1 * (y - 1.1) * (y - 1.1));
      dots = [toScreen(0, 1.1)];
      break;
    case 'Q02_Y_EQ_PX_ONE_X_CROSS':
      pathD = buildSampledXY(-1.6, 2.3, (x) => -0.45 * (x - 1.2) * (x * x + 0.8));
      dots = [toScreen(1.2, 0)];
      break;
    case 'Q03_Y_EQ_PX_THREE_X_CROSS':
      pathD = buildSampledXY(-2.1, 2.2, (x) => 0.55 * (x + 1.6) * (x - 0.2) * (x - 1.7));
      dots = [-1.6, 0.2, 1.7].map((dx) => toScreen(dx, 0));
      break;
    case 'Q04_X_EQ_PY_ONE_Y_CROSS':
      pathD = buildSampledXY(-2.0, 2.0, (x) => 0.7 * x * x - 1.0);
      dots = [toScreen(0, -1.0)];
      break;
    case 'Q05_Y_EQ_PX_THREE_X_WAVE':
      pathD = buildSampledXY(-2.0, 2.0, (x) => 0.62 * (x + 1.5) * (x + 0.3) * (x - 1.4));
      dots = [-1.5, -0.3, 1.4].map((dx) => toScreen(dx, 0));
      break;
    case 'Q06_Y_EQ_PX_FOUR_X_WAVE':
      pathD = buildSampledXY(-2.05, 2.05, (x) => 0.45 * (x * x - 0.49) * (x * x - 2.89));
      dots = [-1.7, -0.7, 0.7, 1.7].map((dx) => toScreen(dx, 0));
      break;
    case 'Q07_Y_EQ_PX_TWO_X_PARABOLA':
      pathD = buildSampledXY(-1.6, 2.2, (x) => 0.9 * (x + 0.8) * (x - 1.4));
      dots = [-0.8, 1.4].map((dx) => toScreen(dx, 0));
      break;
    case 'Q08_X_EQ_PY_THREE_Y_WAVE':
      pathD = buildSampledYX(-2.0, 2.1, (y) => 0.55 * (y + 1.5) * (y - 0.1) * (y - 1.6));
      dots = [-1.5, 0.1, 1.6].map((dy) => toScreen(0, dy));
      break;
    case 'Q09_Y_EQ_PX_ONE_X_TOUCH':
      pathD = buildSampledXY(-1.7, 1.7, (x) => -0.75 * x * x);
      dots = [toScreen(0, 0)];
      break;
    case 'Q10_X_EQ_PY_ZERO_Y_LINE': {
      const [x1, y1] = toScreen(1.3, 2.1);
      const [x2, y2] = toScreen(1.3, -2.1);
      verticalLine = { x1, y1, x2, y2 };
      break;
    }
    case 'Q11_Y_EQ_PX_TWO_X_PARABOLA':
      pathD = buildSampledXY(-2.0, 2.0, (x) => 0.78 * (x + 1.2) * (x - 1.2));
      dots = [-1.2, 1.2].map((dx) => toScreen(dx, 0));
      break;
    case 'Q12_Y_EQ_PX_ONE_X_RIGHT_TOUCH':
      pathD = buildSampledXY(-0.3, 2.5, (x) => -0.85 * (x - 1.1) * (x - 1.1));
      dots = [toScreen(1.1, 0)];
      break;
  }

  const gridLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const gx = cx + i * unit;
    const gy = cy + i * unit;
    if (gx >= 12 && gx <= width - 12) {
      gridLines.push({ x1: gx, y1: 10, x2: gx, y2: height - 10 });
    }
    if (gy >= 10 && gy <= height - 10) {
      gridLines.push({ x1: 12, y1: gy, x2: width - 12, y2: gy });
    }
  }

  return (
    <div className="rounded-xl bg-slate-100/80 dark:bg-slate-800/70 p-3 flex flex-col items-center border border-slate-200 dark:border-slate-700">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
        આલેખ (Graph)
      </span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[400px] h-44 text-slate-700 dark:text-slate-200"
        role="img"
        aria-label="બહુપદીનો આલેખ"
      >
        {/* Subtle background grid */}
        {gridLines.map((line, idx) => (
          <line
            key={idx}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className="stroke-slate-300/60 dark:stroke-slate-700"
            strokeWidth={1}
          />
        ))}

        {/* X and Y axes */}
        <line x1={16} y1={cy} x2={width - 16} y2={cy} stroke="currentColor" strokeWidth={1.8} />
        <line x1={cx} y1={12} x2={cx} y2={height - 12} stroke="currentColor" strokeWidth={1.8} />

        {/* Arrowheads */}
        <polyline
          points={`${width - 23},${cy - 4} ${width - 16},${cy} ${width - 23},${cy + 4}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        />
        <polyline
          points={`23,${cy - 4} 16,${cy} 23,${cy + 4}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        />
        <polyline
          points={`${cx - 4},19 ${cx},12 ${cx + 4},19`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        />
        <polyline
          points={`${cx - 4},${height - 19} ${cx},${height - 12} ${cx + 4},${height - 19}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        />

        {/* Axis labels */}
        <text x={width - 26} y={cy + 14} fontSize={11} fontWeight="bold" fill="currentColor">
          X
        </text>
        <text x={14} y={cy + 14} fontSize={11} fontWeight="bold" fill="currentColor">
          X&apos;
        </text>
        <text x={cx + 8} y={16} fontSize={11} fontWeight="bold" fill="currentColor">
          Y
        </text>
        <text x={cx + 8} y={height - 12} fontSize={11} fontWeight="bold" fill="currentColor">
          Y&apos;
        </text>
        <text x={cx + 5} y={cy + 13} fontSize={10} fontWeight="bold" fill="currentColor">
          O
        </text>

        {/* Curve */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            className="stroke-[#1E3A8A] dark:stroke-[#93C5FD]"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {verticalLine && (
          <line
            x1={verticalLine.x1}
            y1={verticalLine.y1}
            x2={verticalLine.x2}
            y2={verticalLine.y2}
            className="stroke-[#1E3A8A] dark:stroke-[#93C5FD]"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}

        {/* Intercept points */}
        {dots.map(([dx, dy], idx) => (
          <circle
            key={idx}
            cx={dx}
            cy={dy}
            r={4.8}
            className="fill-[#D97706] dark:fill-[#FCD34D]"
          />
        ))}
      </svg>
    </div>
  );
};
