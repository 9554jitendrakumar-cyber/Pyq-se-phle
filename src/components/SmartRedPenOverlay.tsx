import React from 'react';
import {
  type SmartPageLayoutResult,
  getHandDrawnCirclePoints
} from '../utils/smartAnnotationLayout';

const ASPECT = 1.414;

interface SmartRedPenOverlayProps {
  layout: SmartPageLayoutResult;
  highlightedAnnotationId?: string | null;
  effectiveFont?: 'kalam' | 'mukta';
}

/**
 * Renders organic hand-drawn red-pen connector arrows (straight, curved, elbow),
 * circled callout badges (①② fallback when long arrows would cross dense handwriting),
 * and the automatic Last-Page Examiner Summary box.
 */
export const SmartRedPenOverlay: React.FC<SmartRedPenOverlayProps> = ({
  layout,
  highlightedAnnotationId,
  effectiveFont = 'kalam'
}) => {
  const fontFamily =
    effectiveFont === 'mukta'
      ? "'Mukta', 'Noto Sans Devanagari', sans-serif"
      : "'Kalam', 'Noto Sans Devanagari', cursive, sans-serif";

  return (
    <>
      <svg
        viewBox={`0 0 100 ${100 * ASPECT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none z-15"
        style={{ mixBlendMode: layout.isDimPhoto ? 'normal' : 'multiply' }}
        aria-hidden="true"
      >
        {layout.placed.map((item) => {
          const { connector, annotation, inkColor } = item;
          const isHighlighted = highlightedAnnotationId === annotation.id;

          if (connector.mode === 'none') return null;

          if (connector.mode === 'badge' && connector.badgeSymbol) {
            const bx = connector.tx;
            const by = connector.ty * ASPECT;
            return (
              <g key={`badge-${annotation.id}`} opacity={isHighlighted ? 1 : 0.92}>
                <circle
                  cx={bx}
                  cy={by}
                  r={isHighlighted ? 2.15 : 1.85}
                  fill="rgba(255,255,255,0.88)"
                  stroke={inkColor}
                  strokeWidth={isHighlighted ? 0.42 : 0.32}
                />
                <text
                  x={bx}
                  y={by + 0.65}
                  textAnchor="middle"
                  fill={inkColor}
                  fontSize="2.35"
                  fontWeight="800"
                  style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                >
                  {connector.badgeSymbol.replace(/[①②③④⑤⑥⑦⑧]/g, (ch) =>
                    String('①②③④⑤⑥⑦⑧'.indexOf(ch) + 1)
                  )}
                </text>
              </g>
            );
          }

          if (connector.mode === 'arrow') {
            const sx = connector.sx;
            const sy = connector.sy * ASPECT;
            const cx = connector.cx;
            const cy = connector.cy * ASPECT;
            const tx = connector.tx;
            const ty = connector.ty * ASPECT;
            const hlx = connector.headLeftX;
            const hly = connector.headLeftY * ASPECT;
            const hrx = connector.headRightX;
            const hry = connector.headRightY * ASPECT;

            const pathD = `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)}`;
            const headD = `M ${hlx.toFixed(2)} ${hly.toFixed(2)} L ${tx.toFixed(2)} ${ty.toFixed(2)} L ${hrx.toFixed(2)} ${hry.toFixed(2)}`;

            return (
              <g
                key={`arrow-${annotation.id}`}
                opacity={isHighlighted ? 1 : 0.93}
                className="transition-opacity duration-150"
              >
                {/* Soft subtle ink halo on dim phone photos for maximum legibility */}
                {layout.isDimPhoto && (
                  <>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="rgba(255,255,255,0.58)"
                      strokeWidth={0.92}
                      strokeLinecap="round"
                    />
                    <path
                      d={headD}
                      fill="none"
                      stroke="rgba(255,255,255,0.58)"
                      strokeWidth={0.95}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                <path
                  d={pathD}
                  fill="none"
                  stroke={inkColor}
                  strokeWidth={isHighlighted ? 0.64 : 0.46}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={headD}
                  fill="none"
                  stroke={inkColor}
                  strokeWidth={isHighlighted ? 0.66 : 0.49}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }

          return null;
        })}
      </svg>

      {/* Automatic Last-Page Examiner Summary Box (in natural bottom whitespace, 0 extra AI tokens) */}
      {layout.examinerSummary && (
        <div
          className="absolute pointer-events-none z-15 select-none"
          style={{
            left: `${layout.examinerSummary.x}%`,
            top: `${layout.examinerSummary.y}%`,
            width: `${layout.examinerSummary.width}%`,
            color: layout.examinerSummary.inkColor,
            fontFamily,
            mixBlendMode: layout.isDimPhoto ? 'normal' : 'multiply'
          }}
        >
          <div
            className="rounded-sm px-2 py-1"
            style={{
              borderTop: `1.5px dashed ${layout.examinerSummary.inkColor}88`,
              backgroundColor: layout.isDimPhoto ? 'rgba(255,255,255,0.42)' : 'transparent'
            }}
          >
            <div
              className="font-bold leading-snug"
              style={{ fontSize: '1.78cqi' }}
            >
              <span>★ अगली कॉपी का #1 फोकस: </span>
              <span>{layout.examinerSummary.focusLine}</span>
            </div>
            {layout.examinerSummary.strengthLine && (
              <div
                className="font-semibold leading-snug opacity-90 mt-0.5"
                style={{ fontSize: '1.58cqi' }}
              >
                <span>✓ सबल पक्ष: </span>
                <span>{layout.examinerSummary.strengthLine}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

interface HandDrawnMarksCircleProps {
  obtained: number;
  maxMarks: number;
  inkColor?: string;
}

/**
 * Hand-drawn double-loop red-pen circle for Page 1 total marks.
 */
export const HandDrawnMarksCircle: React.FC<HandDrawnMarksCircleProps> = ({
  obtained,
  maxMarks,
  inkColor = '#b91c1c'
}) => {
  const pts = React.useMemo(() => getHandDrawnCirclePoints(50, 50, 42, 41, 2.3), []);
  const pathD = React.useMemo(() => {
    if (pts.length === 0) return '';
    return (
      `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
      pts
        .slice(1)
        .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ')
    );
  }, [pts]);

  return (
    <div
      className="absolute top-2.5 right-2.5 z-30 flex items-center justify-center pointer-events-none select-none"
      style={{
        width: '13.8%',
        aspectRatio: '1/1',
        minWidth: '64px',
        maxWidth: '108px',
        transform: 'rotate(-4deg)'
      }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-xs">
        <circle cx="50" cy="50" r="41" fill="rgba(255,255,255,0.88)" />
        <path
          d={pathD}
          fill="none"
          stroke={inkColor}
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="relative font-extrabold text-center whitespace-nowrap leading-none px-1"
        style={{
          color: inkColor,
          fontSize: 'clamp(11px, 1.8cqi, 20px)',
          fontFamily: "'Kalam', 'Noto Sans Devanagari', cursive, sans-serif"
        }}
      >
        {obtained} / {maxMarks}
      </span>
    </div>
  );
};
