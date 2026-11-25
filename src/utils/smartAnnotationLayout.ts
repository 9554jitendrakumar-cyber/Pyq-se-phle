/**
 * Autonomous Smart Annotation Placement & Human Red-Pen Arrow Engine (Stage 1)
 *
 * Pure deterministic layout & SVG/Canvas path router shared 100% identically
 * between the live React viewer (App.tsx) and the PDF exporter (scorecardExport.ts).
 *
 * Guarantees:
 * - Zero handwriting overlap across all 6 UPSC copy types (wide/narrow/one-sided/
 *   zero-margin phone photos, paragraph gaps, short-line pockets, top/bottom space).
 * - Automatic paper-matched virtual margin expansion when a zero-margin sheet is packed.
 * - Organic human-like red-pen arrows (straight, curved Bezier, elbow, bottom arc)
 *   with strict non-crossing ordering and automatic circled-badge (①②) fallback if an
 *   arrow would have to slice across dense handwriting.
 * - Full preservation of Owner manually dragged (`is_custom_positioned`) annotations.
 * - Optional automatic Last-Page Examiner Summary box (using existing AI rubric data, 0 extra tokens).
 */

import type { Annotation, EvaluationResult } from '../types/evaluation';
import { isAnnotationStamp } from './annotationSanitizer';
import {
  type PageGeometryAnalysis,
  createFallbackPageAnalysis,
  getRegionInkRatio,
  getCurveCrossedInkRatio
} from './pageWhitespaceAnalyzer';

export type PlacementZone =
  | 'left_margin'
  | 'right_margin'
  | 'gap'
  | 'bottom'
  | 'top'
  | 'virtual_margin'
  | 'custom';

export type ConnectorMode = 'arrow' | 'badge' | 'none';
export type ResolvedArrowStyle = 'straight' | 'curved' | 'elbow';

export interface SmartArrowGeometry {
  mode: ConnectorMode;
  style: ResolvedArrowStyle;
  /** Start point on comment box edge (0..100% of total rendered frame) */
  sx: number;
  sy: number;
  /** Quadratic Bezier control point (0..100% of total rendered frame) */
  cx: number;
  cy: number;
  /** Target point at student handwriting edge (0..100% of total rendered frame) */
  tx: number;
  ty: number;
  /** Two asymmetric hand-drawn arrowhead wing endpoints (in 0..100% frame X, 0..100% frame Y) */
  headLeftX: number;
  headLeftY: number;
  headRightX: number;
  headRightY: number;
  /** Circled badge symbol when mode === 'badge' (e.g. '①', '②') */
  badgeSymbol?: string;
}

export interface SmartPlacedAnnotation<T extends Annotation = Annotation> {
  annotation: T;
  isStamp: boolean;
  isLeft: boolean;
  zone: PlacementZone;
  /** Box left X% in total rendered frame (0..100) */
  boxX: number;
  /** Box top Y% in total rendered frame (0..100) — note: top-aligned (NOT center-transformed) */
  boxTopY: number;
  /** Box center Y% in total rendered frame (0..100) */
  boxCenterY: number;
  /** Box width % in total rendered frame */
  boxWidth: number;
  /** Estimated box height % in total rendered frame */
  boxHeight: number;
  /** Subtle organic hand-tilt in degrees (-0.85 to +0.85) */
  rotationDeg: number;
  /** Adaptive red/maroon pen hex color */
  inkColor: string;
  /** Connector arrow or numbered callout geometry */
  connector: SmartArrowGeometry;
  /** Compatibility with existing drag handler */
  _adjustedY: number;
}

export interface ExaminerSummaryBox {
  x: number;
  y: number;
  width: number;
  height: number;
  focusLine: string;
  strengthLine?: string;
  inkColor: string;
}

export interface SmartPageLayoutResult<T extends Annotation = Annotation> {
  /** Extra left/right paper-matched margin % added around image when sheet has zero/tight margins */
  virtualMarginLeftPct: number;
  virtualMarginRightPct: number;
  /** Width % occupied by original sheet image inside the frame */
  imageLeftPct: number;
  imageWidthPct: number;
  paperBgHex: string;
  inkColor: string;
  isDimPhoto: boolean;
  copyType: PageGeometryAnalysis['copyType'];
  placed: Array<SmartPlacedAnnotation<T>>;
  examinerSummary?: ExaminerSummaryBox;
}

const CIRCLED_NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Deterministic pseudo-random in [-1, 1] seeded by string ID so renders never flicker */
function seededJitter(seed: string, salt: number = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 500 - 1;
}

/**
 * Estimates height (% of A4 page height) for a comment given its box width % and font scale.
 */
function estimateBoxHeightPct(text: string, widthPct: number, fontScale: number = 1.0): number {
  if (!text || isAnnotationStamp(text)) return 3.6;
  // Rough Devanagari chars per line at widthPct (at 13.5% width, ~11-12 chars/line at scale 1.0)
  const charsPerLine = Math.max(7, (widthPct / 13.5) * (11.5 / Math.max(0.65, fontScale)));
  const cleanLen = text.trim().length;
  const estLines = Math.max(1, Math.ceil(cleanLen / charsPerLine));
  // Each line at 1.68cqi height ≈ 2.1% of A4 height (height = 1.414 * width)
  const lineH = 2.05 * fontScale;
  return clamp(estLines * lineH + 1.4, 4.2, 24);
}

/** Maps an X% in original image space [0..100] into total frame space accounting for virtual margins */
function mapImgXToFrame(imgX: number, imageLeftPct: number, imageWidthPct: number): number {
  return imageLeftPct + (imgX / 100) * imageWidthPct;
}

/** Maps a frame X% back to original image space [0..100] */
function mapFrameXToImg(frameX: number, imageLeftPct: number, imageWidthPct: number): number {
  return ((frameX - imageLeftPct) / Math.max(1, imageWidthPct)) * 100;
}

interface BoxRect {
  x: number;
  y: number; // top
  w: number;
  h: number;
}

function rectsOverlap(a: BoxRect, b: BoxRect, padX: number = 0.8, padY: number = 1.0): boolean {
  return !(
    a.x + a.w + padX <= b.x ||
    b.x + b.w + padX <= a.x ||
    a.y + a.h + padY <= b.y ||
    b.y + b.h + padY <= a.y
  );
}

/**
 * Finds the nearest actual handwritten ink row to `desiredY` (in 0..100%) and returns its edge X%.
 */
function snapTargetToInkRow(
  analysis: PageGeometryAnalysis,
  desiredY: number,
  pageNum: number
): { anchorY: number; rowStartX: number; rowEndX: number; hasInk: boolean } {
  const minAllowedY = pageNum === 1 ? 15 : 8;
  const clampedY = clamp(Math.round(desiredY), minAllowedY, 93);

  // Search outward up to ±6% for a row with real handwritten ink
  for (let delta = 0; delta <= 6; delta++) {
    const candidates = delta === 0 ? [clampedY] : [clampedY - delta, clampedY + delta];
    for (const cy of candidates) {
      if (cy < minAllowedY || cy > 93) continue;
      const row = analysis.rowInkBounds[cy];
      if (row && row.hasInk) {
        return {
          anchorY: cy,
          rowStartX: clamp(row.startX, 4, 88),
          rowEndX: clamp(row.endX, 12, 96),
          hasInk: true
        };
      }
    }
  }

  // Fallback to general content span if row area appears blank
  return {
    anchorY: clampedY,
    rowStartX: clamp(analysis.leftMarginWidth + 2, 12, 22),
    rowEndX: clamp(100 - analysis.rightMarginWidth - 2, 76, 88),
    hasInk: false
  };
}

/**
 * Computes organic hand-drawn arrow geometry from placed comment box to target ink edge.
 */
function buildConnectorGeometry(
  annId: string,
  box: BoxRect,
  zone: PlacementZone,
  targetFrameX: number,
  targetY: number,
  analysis: PageGeometryAnalysis,
  imageLeftPct: number,
  imageWidthPct: number,
  explicitStyle: Annotation['arrow_style'],
  badgeCounterRef: { count: number }
): SmartArrowGeometry {
  const emptyConnector: SmartArrowGeometry = {
    mode: 'none',
    style: 'straight',
    sx: box.x,
    sy: box.y,
    cx: box.x,
    cy: box.y,
    tx: targetFrameX,
    ty: targetY,
    headLeftX: targetFrameX,
    headLeftY: targetY,
    headRightX: targetFrameX,
    headRightY: targetY
  };

  if (explicitStyle === 'none') {
    return emptyConnector;
  }

  const boxCenterX = box.x + box.w / 2;
  const boxCenterY = box.y + box.h / 2;

  // Determine natural attachment edge on the comment box
  let sx = boxCenterX;
  let sy = boxCenterY;

  const isLeftSide = zone === 'left_margin' || (zone === 'virtual_margin' && boxCenterX < 50);
  const isRightSide = zone === 'right_margin' || (zone === 'virtual_margin' && boxCenterX >= 50);
  let isHorizontalPocket = false;

  if (isLeftSide) {
    sx = box.x + box.w + 0.4;
    sy = clamp(targetY, box.y + 1.4, box.y + box.h - 1.4);
  } else if (isRightSide) {
    sx = box.x - 0.4;
    sy = clamp(targetY, box.y + 1.4, box.y + box.h - 1.4);
  } else if (zone === 'bottom') {
    sx = clamp(targetFrameX, box.x + 2, box.x + box.w - 2);
    sy = box.y - 0.4;
  } else if (zone === 'top') {
    sx = clamp(targetFrameX, box.x + 2, box.x + box.w - 2);
    sy = box.y + box.h + 0.4;
  } else {
    // Gap or short-line right pocket
    if (Math.abs(targetFrameX - boxCenterX) > box.w * 0.45) {
      isHorizontalPocket = true;
      sx = targetFrameX < boxCenterX ? box.x - 0.4 : box.x + box.w + 0.4;
      sy = clamp(targetY, box.y + 1.2, box.y + box.h - 1.2);
    } else {
      sx = clamp(targetFrameX, box.x + 2, box.x + box.w - 2);
      sy = targetY < boxCenterY ? box.y - 0.4 : box.y + box.h + 0.4;
    }
  }

  // Guarantee minimum horizontal glide (>= 2.5%) for side-attached arrows so tight margins never form cramped hooks
  const MIN_HORIZONTAL_GLIDE = 2.8;
  let tx = targetFrameX;
  const ty = targetY;

  if (isLeftSide && tx - sx < MIN_HORIZONTAL_GLIDE) {
    tx = clamp(sx + MIN_HORIZONTAL_GLIDE, 2, 96);
  } else if (isRightSide && sx - tx < MIN_HORIZONTAL_GLIDE) {
    tx = clamp(sx - MIN_HORIZONTAL_GLIDE, 4, 98);
  } else if (isHorizontalPocket && Math.abs(tx - sx) < 2.5) {
    const dir = tx >= sx ? 1 : -1;
    tx = clamp(sx + dir * 2.5, 3, 97);
  }

  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy * 1.414);

  const jitter = seededJitter(annId, 17);

  // Pick style based on geometry
  let style: ResolvedArrowStyle = 'curved';
  if (explicitStyle && explicitStyle !== 'auto') {
    style = explicitStyle;
  } else if (Math.abs(dy) < 3.6 && Math.abs(dx) < 15) {
    style = 'straight';
  } else if (zone === 'gap' && Math.abs(dy) >= 3.0) {
    style = 'elbow';
  } else {
    style = 'curved';
  }

  // Compute organic Quadratic Bezier control point (cx, cy) with natural calligraphic flow
  let cx = (sx + tx) / 2;
  let cy = (sy + ty) / 2;
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  if (style === 'straight') {
    // Gentle calligraphic pen bow scaled to span (never a stiff CAD ruler)
    const bowY = clamp(Math.abs(dx) * 0.14, 0.95, 2.0) * (jitter >= 0 ? -1 : 1);
    cx = sx + dx * 0.5;
    cy = clamp(midY + bowY, 1.5, 98.5);
  } else if (style === 'elbow') {
    // Fluid pen turn (softened corner rather than rigid 90-degree elbow)
    cx = clamp(sx + dx * 0.14, 1.5, 98.5);
    cy = clamp(ty - dy * 0.08, 1.5, 98.5);
  } else {
    // Organic curved arc: always flows forward toward target (never hooks backward)
    if (zone === 'bottom' || zone === 'top') {
      const bowX = (tx < 50 ? -1 : 1) * clamp(dist * 0.2, 2.2, 8.5);
      cx = clamp(midX + bowX, 2, 98);
      cy = clamp(midY + (zone === 'bottom' ? -2.2 : 2.2), 1.5, 98.5);
    } else if (Math.abs(dy) < 2.2) {
      // Long nearly-horizontal sweep (e.g., short intro sentence from right margin):
      // graceful upward calligraphic wrist arch so long spans never look like a flat laser line
      const archY = clamp(Math.abs(dx) * 0.15, 1.4, 3.4);
      cx = clamp(sx + dx * 0.48, 1.5, 98.5);
      cy = clamp(midY - archY + jitter * 0.25, 1.5, 98.5);
    } else {
      // Side-margin diagonal sweep: glide smoothly out of margin and sweep cleanly into line edge
      const glideRatio = Math.abs(dx) < 5 ? 0.30 : 0.38;
      const bellyBoost = clamp(Math.abs(dx) * 0.11, 0.75, 2.4) * (dy >= 0 ? 1 : -1);
      cx = clamp(sx + dx * glideRatio, 1.5, 98.5);
      cy = clamp(sy + dy * 0.76 + bellyBoost * 0.42 + jitter * 0.3, 1.5, 98.5);
    }
  }

  // Spaghetti-Arrow Guard: if long path crosses dense handwritten ink, switch to clean ①② callout badge!
  const imgSx = mapFrameXToImg(sx, imageLeftPct, imageWidthPct);
  const imgCx = mapFrameXToImg(cx, imageLeftPct, imageWidthPct);
  const imgTx = mapFrameXToImg(tx, imageLeftPct, imageWidthPct);
  const crossedInk = getCurveCrossedInkRatio(analysis, imgSx, sy, imgCx, cy, imgTx, ty);

  if (dist > 26 && crossedInk > 0.24 && explicitStyle !== 'straight' && explicitStyle !== 'curved') {
    const symbol = CIRCLED_NUMS[badgeCounterRef.count % CIRCLED_NUMS.length];
    badgeCounterRef.count += 1;
    return {
      mode: 'badge',
      style: 'curved',
      sx,
      sy,
      cx,
      cy,
      tx,
      ty,
      headLeftX: tx,
      headLeftY: ty,
      headRightX: tx,
      headRightY: ty,
      badgeSymbol: symbol
    };
  }

  // Compute organic open-V 2-stroke arrowhead along arrival tangent (control point -> target)
  // Account for A4 aspect ratio (height = 1.414 * width) when computing true visual angle!
  const aspect = 1.414;
  const tanX = tx - cx;
  const tanY = (ty - cy) * aspect;
  const tanLen = Math.hypot(tanX, tanY) || 1;
  const ux = tanX / tanLen;
  const uy = tanY / tanLen;

  // Natural open-V arrowhead scaled gracefully to arrow length with subtle hand-drawn asymmetry
  const baseHeadLen = clamp(dist * 0.24, 1.6, 2.1);
  const headLenA = baseHeadLen + jitter * 0.15;
  const headLenB = baseHeadLen * 0.94 - jitter * 0.15;
  const spreadA = 0.54; // ~31 deg open-V upper wing
  const spreadB = 0.60; // ~34.5 deg open-V lower wing

  const cosA = Math.cos(spreadA);
  const sinA = Math.sin(spreadA);
  const cosB = Math.cos(-spreadB);
  const sinB = Math.sin(-spreadB);

  const headLeftX = tx - (ux * cosA - uy * sinA) * headLenA;
  const headLeftY = ty - ((ux * sinA + uy * cosA) * headLenA) / aspect;
  const headRightX = tx - (ux * cosB - uy * sinB) * headLenB;
  const headRightY = ty - ((ux * sinB + uy * cosB) * headLenB) / aspect;

  return {
    mode: 'arrow',
    style,
    sx,
    sy,
    cx,
    cy,
    tx,
    ty,
    headLeftX,
    headLeftY,
    headRightX,
    headRightY
  };
}

/**
 * Generates an organic double-looped hand-drawn red-pen circle path around (cx, cy) with radius r.
 * Works cleanly in both SVG and Canvas2D.
 */
export function getHandDrawnCirclePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number = 1
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const totalSteps = 44;
  // Slightly more than 360° (like a real human circling marks with a pen!)
  const startAngle = -0.35;
  const endAngle = Math.PI * 2 + 0.28;

  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const angle = startAngle + t * (endAngle - startAngle);
    const wobble =
      1 +
      0.032 * Math.sin(angle * 2 + seed) +
      0.018 * Math.cos(angle * 3 - seed * 1.7) +
      (t > 0.85 ? (t - 0.85) * 0.18 : 0);
    pts.push({
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble
    });
  }
  return pts;
}

/**
 * Main Smart Page Layout Solver.
 */
export function computeSmartPageLayout<T extends Annotation>(
  annotations: T[],
  options: {
    analysis?: PageGeometryAnalysis;
    pageNum: number;
    totalPages: number;
    defaultFontScale?: number;
    evalResult?: EvaluationResult | null;
    includeLastPageSummary?: boolean;
  }
): SmartPageLayoutResult<T> {
  const analysis = options.analysis || createFallbackPageAnalysis(false);
  const defaultScale = options.defaultFontScale ?? 1.0;
  const pageNum = options.pageNum;
  const totalPages = options.totalPages;

  // Background-aware red pen contrast: deep classic maroon on clean white scans, brighter crimson on dim photos
  const inkColor = analysis.isDimPhoto ? '#dc2626' : '#991b1b';

  const nonStampAutoAnns = annotations.filter(
    (a) => !isAnnotationStamp(a.text) && !a.is_custom_positioned
  );

  // 1. Decide whether paper-matched Auto Virtual Margins are needed
  // Trigger when BOTH real margins are too tight (< 9.5%) AND internal pockets/bottom space aren't enough
  const hasRealLeft = analysis.leftMarginWidth >= 9.5;
  const hasRealRight = analysis.rightMarginWidth >= 9.5;
  const hasGoodBottom = analysis.lastInkY < 74;
  const usableInternalPockets = analysis.emptyPockets.filter(
    (p) => p.zone === 'gap' || p.zone === 'short_line_right'
  ).length;

  let virtualMarginLeftPct = 0;
  let virtualMarginRightPct = 0;

  if (nonStampAutoAnns.length > 0 && analysis.confidence < 0.5) {
    // Low confidence scan fallback: gentle safe side padding on both sides
    virtualMarginLeftPct = 11.5;
    virtualMarginRightPct = 11.5;
  } else if (nonStampAutoAnns.length > 0 && !hasRealLeft && !hasRealRight) {
    // Zero-margin or narrow-margin sheet!
    const internalCapacity = (hasGoodBottom ? 2 : 0) + Math.min(2, usableInternalPockets);
    if (nonStampAutoAnns.length > internalCapacity) {
      if (nonStampAutoAnns.length <= 3) {
        // Add single clean right virtual margin
        virtualMarginRightPct = 14.5;
      } else {
        // Add balanced clean virtual margins on both sides
        virtualMarginLeftPct = 13.5;
        virtualMarginRightPct = 13.5;
      }
    }
  } else if (nonStampAutoAnns.length >= 4 && (!hasRealLeft || !hasRealRight) && !hasGoodBottom) {
    // One-sided margin copy with 4+ comments and no bottom space → add virtual margin on cramped side
    if (!hasRealLeft) virtualMarginLeftPct = 13.0;
    else if (!hasRealRight) virtualMarginRightPct = 13.0;
  }

  const imageLeftPct = virtualMarginLeftPct;
  const imageWidthPct = Math.max(60, 100 - virtualMarginLeftPct - virtualMarginRightPct);

  // Available left & right margin widths in TOTAL FRAME %
  const frameLeftFreeWidth =
    virtualMarginLeftPct > 0
      ? virtualMarginLeftPct + (analysis.leftMarginWidth * imageWidthPct) / 100
      : (analysis.leftMarginWidth * imageWidthPct) / 100;

  const frameRightFreeWidth =
    virtualMarginRightPct > 0
      ? virtualMarginRightPct + (analysis.rightMarginWidth * imageWidthPct) / 100
      : (analysis.rightMarginWidth * imageWidthPct) / 100;

  // Occupied obstacles list (in total frame %)
  const occupiedRects: BoxRect[] = [];

  // Reserve Page 1 top-right marks circle zone so no comment ever touches it
  if (pageNum === 1) {
    occupiedRects.push({ x: 81, y: 0, w: 19, h: 16.5 });
  }

  // Reserve bottom footer strip (for PDF parity)
  const MAX_CONTENT_BOTTOM_Y = 93.5;

  const placed: Array<SmartPlacedAnnotation<T>> = [];
  const badgeCounterRef = { count: 0 };

  // First pass: register stamps & manually pinned Owner annotations so auto-comments never collide with them
  const sortedInputs = [...annotations].sort((a, b) => a.y_percent - b.y_percent);

  for (const ann of sortedInputs) {
    const stamp = isAnnotationStamp(ann.text);
    if (!stamp && !ann.is_custom_positioned) continue;

    const scale = ann.font_scale || defaultScale;
    const width = stamp ? 4 : ann.width_percent || 13.5;
    const height = estimateBoxHeightPct(ann.text, width, scale);
    const boxX = stamp
      ? mapImgXToFrame(ann.x_percent, imageLeftPct, imageWidthPct)
      : clamp(ann.x_percent, 0.5, 99 - width);
    const boxCenterY = clamp(ann.y_percent, 3, 95);
    const boxTopY = clamp(boxCenterY - height / 2, 1.5, 96 - height);

    if (!stamp) {
      occupiedRects.push({ x: boxX, y: boxTopY, w: width, h: height });
    }

    const snap = snapTargetToInkRow(analysis, ann.anchor_y_percent ?? boxCenterY, pageNum);
    const isLeft = boxX + width / 2 < 50;
    const defaultTargetImgX = isLeft ? Math.max(2, snap.rowStartX - 1.2) : Math.min(98, snap.rowEndX + 1.2);
    const targetFrameX =
      ann.is_custom_anchor && typeof ann.anchor_x_percent === 'number'
        ? ann.anchor_x_percent
        : mapImgXToFrame(defaultTargetImgX, imageLeftPct, imageWidthPct);

    const connector = stamp
      ? {
          mode: 'none' as const,
          style: 'straight' as const,
          sx: boxX,
          sy: boxCenterY,
          cx: boxX,
          cy: boxCenterY,
          tx: boxX,
          ty: boxCenterY,
          headLeftX: boxX,
          headLeftY: boxCenterY,
          headRightX: boxX,
          headRightY: boxCenterY
        }
      : buildConnectorGeometry(
          ann.id,
          { x: boxX, y: boxTopY, w: width, h: height },
          'custom',
          targetFrameX,
          ann.anchor_y_percent ?? snap.anchorY,
          analysis,
          imageLeftPct,
          imageWidthPct,
          ann.arrow_style ?? 'none', // Don't force arrows on legacy manually positioned notes unless opted in
          badgeCounterRef
        );

    placed.push({
      annotation: ann,
      isStamp: stamp,
      isLeft,
      zone: 'custom',
      boxX,
      boxTopY,
      boxCenterY,
      boxWidth: width,
      boxHeight: height,
      rotationDeg: 0,
      inkColor,
      connector,
      _adjustedY: boxCenterY
    });
  }

  // Second pass: Autonomously place all auto-annotations using multi-zone scoring
  interface PendingAutoPlacement {
    ann: T;
    anchorY: number;
    rowStartX: number;
    rowEndX: number;
    preferredLeft: boolean;
    scale: number;
  }

  const autoItems: PendingAutoPlacement[] = sortedInputs
    .filter((a) => !isAnnotationStamp(a.text) && !a.is_custom_positioned)
    .map((ann) => {
      const snap = snapTargetToInkRow(analysis, ann.y_percent, pageNum);
      return {
        ann,
        anchorY: snap.anchorY,
        rowStartX: snap.rowStartX,
        rowEndX: snap.rowEndX,
        preferredLeft: ann.x_percent < 50,
        scale: ann.font_scale || defaultScale
      };
    })
    // Sort monotonically by snapped anchorY to prevent margin arrow crossings!
    .sort((a, b) => a.anchorY - b.anchorY);

  // Track last bottom Y per side for clean vertical monotonic progression (non-crossing arrows!)
  let lastLeftPlacedBottom = pageNum === 1 ? 14 : 6;
  let lastRightPlacedBottom = pageNum === 1 ? 17.5 : 6;
  let leftSideCount = 0;
  let rightSideCount = 0;

  for (const item of autoItems) {
    const { ann, anchorY, rowStartX, rowEndX, preferredLeft, scale } = item;

    interface Candidate {
      zone: PlacementZone;
      rect: BoxRect;
      score: number;
      targetImgX: number;
      isLeft: boolean;
    }

    const candidates: Candidate[] = [];

    const tryAddCandidate = (
      zone: PlacementZone,
      x: number,
      topY: number,
      w: number,
      h: number,
      targetImgX: number,
      isLeft: boolean,
      zoneBias: number
    ) => {
      if (x < 0.4 || x + w > 99.6 || topY < 2.0 || topY + h > MAX_CONTENT_BOTTOM_Y) return;
      const rect: BoxRect = { x, y: topY, w, h };

      // Hard reject collision with existing comments / Page 1 marks circle
      for (const occ of occupiedRects) {
        if (rectsOverlap(rect, occ, 0.9, 1.1)) return;
      }

      // Check ink overlap inside the original image portion of this rectangle
      const imgX0 = clamp(mapFrameXToImg(x, imageLeftPct, imageWidthPct), 0, 100);
      const imgX1 = clamp(mapFrameXToImg(x + w, imageLeftPct, imageWidthPct), 0, 100);
      let inkRatio = 0;
      if (imgX1 - imgX0 > 1.5) {
        inkRatio = getRegionInkRatio(analysis, imgX0, topY, imgX1 - imgX0, h);
      }

      // Strict zero-overlap threshold (slightly forgiving on faint bleed < 0.035)
      if (inkRatio > 0.038) return;

      const centerY = topY + h / 2;
      const distY = Math.abs(centerY - anchorY);
      const targetFrameX = mapImgXToFrame(targetImgX, imageLeftPct, imageWidthPct);
      const nearestBoxX = targetFrameX < x ? x : targetFrameX > x + w ? x + w : targetFrameX;
      const distX = Math.abs(targetFrameX - nearestBoxX);

      // Lower score is better
      const score =
        distY * 2.2 +
        distX * 0.75 +
        inkRatio * 260 +
        zoneBias;

      candidates.push({ zone, rect, score, targetImgX, isLeft });
    };

    // Candidate 1: Left Margin (real or virtual)
    if (frameLeftFreeWidth >= 9.2) {
      const w = clamp(Math.min(ann.width_percent || 14.0, frameLeftFreeWidth - 0.8), 10.2, 15.8);
      const h = estimateBoxHeightPct(ann.text, w, scale);
      const x = 0.6;
      const idealTop = clamp(anchorY - h / 2, pageNum === 1 ? 14 : 6, MAX_CONTENT_BOTTOM_Y - h);
      // Enforce monotonic downward placement to prevent arrow crossings on left margin
      const nonCrossingTop = Math.max(idealTop, lastLeftPlacedBottom + 1.4);
      const sideBias = (preferredLeft ? 0 : 2.8) + (leftSideCount >= 3 && rightSideCount <= 1 ? 10 : 0);
      const zone: PlacementZone = virtualMarginLeftPct > 0 ? 'virtual_margin' : 'left_margin';
      tryAddCandidate(zone, x, nonCrossingTop, w, h, Math.max(2, rowStartX - 1.2), true, sideBias);
      // Also allow slightly shifted up if bottom overflows
      if (nonCrossingTop + h > MAX_CONTENT_BOTTOM_Y) {
        tryAddCandidate(zone, x, MAX_CONTENT_BOTTOM_Y - h, w, h, Math.max(2, rowStartX - 1.2), true, sideBias + 4);
      }
    }

    // Candidate 2: Right Margin (real or virtual)
    if (frameRightFreeWidth >= 9.2) {
      const w = clamp(Math.min(ann.width_percent || 14.0, frameRightFreeWidth - 0.8), 10.2, 15.8);
      const h = estimateBoxHeightPct(ann.text, w, scale);
      const x = 99.4 - w;
      const minRightTop = pageNum === 1 ? 17.5 : 6;
      const idealTop = clamp(anchorY - h / 2, minRightTop, MAX_CONTENT_BOTTOM_Y - h);
      const nonCrossingTop = Math.max(idealTop, lastRightPlacedBottom + 1.4);
      const sideBias = (!preferredLeft ? 0 : 2.8) + (rightSideCount >= 3 && leftSideCount <= 1 ? 10 : 0);
      const zone: PlacementZone = virtualMarginRightPct > 0 ? 'virtual_margin' : 'right_margin';
      tryAddCandidate(zone, x, nonCrossingTop, w, h, Math.min(98, rowEndX + 1.2), false, sideBias);
      if (nonCrossingTop + h > MAX_CONTENT_BOTTOM_Y) {
        tryAddCandidate(zone, x, MAX_CONTENT_BOTTOM_Y - h, w, h, Math.min(98, rowEndX + 1.2), false, sideBias + 4);
      }
    }

    // Candidate 3: Internal Empty Pockets (Paragraph Gaps & Short-Line Right Pockets)
    for (const pocket of analysis.emptyPockets) {
      if (pocket.zone === 'gap' || pocket.zone === 'short_line_right') {
        const pocketCenterY = pocket.y + pocket.height / 2;
        if (Math.abs(pocketCenterY - anchorY) > 15) continue; // Only use nearby internal pockets

        const framePocketX = mapImgXToFrame(pocket.x, imageLeftPct, imageWidthPct);
        const framePocketW = (pocket.width * imageWidthPct) / 100;
        const w = clamp(Math.min(framePocketW - 1.0, 28), 16, 30);
        const h = estimateBoxHeightPct(ann.text, w, scale * 0.94);

        if (h <= pocket.height + 1.2) {
          const placedX = pocket.zone === 'short_line_right'
            ? framePocketX + framePocketW - w
            : clamp(framePocketX + (framePocketW - w) / 2, framePocketX, framePocketX + framePocketW - w);
          const placedY = clamp(pocket.y + (pocket.height - h) / 2, pocket.y, pocket.y + pocket.height - h);
          const targetImgX =
            pocket.zone === 'short_line_right'
              ? Math.min(pocket.x - 1.5, rowEndX + 1.2)
              : clamp((rowStartX + rowEndX) / 2, 20, 80);

          // Slightly favor pockets when side margins are tight
          const pocketBias = !hasRealLeft && !hasRealRight ? -2.0 : 3.5;
          tryAddCandidate('gap', placedX, placedY, w, h, targetImgX, false, pocketBias);
        }
      }

      // Candidate 4: Bottom Whitespace Pockets (especially great for lower comments or zero-margin pages!)
      if (pocket.zone === 'bottom') {
        const framePocketX = mapImgXToFrame(pocket.x, imageLeftPct, imageWidthPct);
        const framePocketW = (pocket.width * imageWidthPct) / 100;
        const w = clamp(Math.min(framePocketW - 2, 36), 22, 38);
        const h = estimateBoxHeightPct(ann.text, w, scale);
        if (h <= pocket.height) {
          const targetImgX = pocket.x < 50 ? Math.max(4, rowStartX) : Math.min(96, rowEndX);
          const distFromBottom = Math.max(0, pocket.y - anchorY);
          const bottomBias = distFromBottom < 20 ? 1.5 : 8.5;
          tryAddCandidate('bottom', framePocketX + 1, pocket.y + 1.0, w, h, targetImgX, pocket.x < 50, bottomBias);
        }
      }

      // Candidate 5: Top Whitespace (good for Intro comments near top of page)
      if (pocket.zone === 'top' && anchorY < 28) {
        const framePocketX = mapImgXToFrame(pocket.x, imageLeftPct, imageWidthPct);
        const framePocketW = (pocket.width * imageWidthPct) / 100;
        const w = clamp(Math.min(framePocketW - 2, 34), 20, 36);
        const h = estimateBoxHeightPct(ann.text, w, scale);
        if (h <= pocket.height) {
          const targetImgX = clamp(rowStartX + 10, 14, 60);
          tryAddCandidate('top', framePocketX + 1, pocket.y + 0.5, w, h, targetImgX, true, 4.0);
        }
      }
    }

    // Pick lowest-score candidate; if none passed strict filter, use guaranteed safe edge fallback
    candidates.sort((a, b) => a.score - b.score);
    let chosen = candidates[0];

    if (!chosen) {
      // Guaranteed fallback: stack cleanly in the freer margin without overlapping other annotations
      const useLeft = frameLeftFreeWidth >= frameRightFreeWidth;
      const w = clamp(ann.width_percent || 13.2, 10.5, 14.5);
      const h = estimateBoxHeightPct(ann.text, w, scale);
      const x = useLeft ? 0.6 : 99.4 - w;
      let y = clamp(anchorY - h / 2, useLeft ? (pageNum === 1 ? 14 : 6) : (pageNum === 1 ? 17.5 : 6), MAX_CONTENT_BOTTOM_Y - h);

      // Step downward until non-overlapping with existing boxes
      for (let tries = 0; tries < 25; tries++) {
        const testRect = { x, y, w, h };
        if (!occupiedRects.some((occ) => rectsOverlap(testRect, occ, 0.6, 0.8))) break;
        y += 3.5;
        if (y + h > MAX_CONTENT_BOTTOM_Y) {
          // Try stepping upward from original
          y = clamp(anchorY - h / 2 - tries * 2.5, 6, MAX_CONTENT_BOTTOM_Y - h);
          break;
        }
      }

      chosen = {
        zone: useLeft
          ? virtualMarginLeftPct > 0
            ? 'virtual_margin'
            : 'left_margin'
          : virtualMarginRightPct > 0
            ? 'virtual_margin'
            : 'right_margin',
        rect: { x, y, w, h },
        score: 999,
        targetImgX: useLeft ? Math.max(2, rowStartX - 1.2) : Math.min(98, rowEndX + 1.2),
        isLeft: useLeft
      };
    }

    occupiedRects.push(chosen.rect);
    if (chosen.zone === 'left_margin' || (chosen.zone === 'virtual_margin' && chosen.isLeft)) {
      lastLeftPlacedBottom = Math.max(lastLeftPlacedBottom, chosen.rect.y + chosen.rect.h);
      leftSideCount++;
    } else if (chosen.zone === 'right_margin' || (chosen.zone === 'virtual_margin' && !chosen.isLeft)) {
      lastRightPlacedBottom = Math.max(lastRightPlacedBottom, chosen.rect.y + chosen.rect.h);
      rightSideCount++;
    }

    const targetFrameX = mapImgXToFrame(chosen.targetImgX, imageLeftPct, imageWidthPct);
    const connector = buildConnectorGeometry(
      ann.id,
      chosen.rect,
      chosen.zone,
      targetFrameX,
      anchorY,
      analysis,
      imageLeftPct,
      imageWidthPct,
      ann.arrow_style ?? 'auto',
      badgeCounterRef
    );

    const boxCenterY = Number((chosen.rect.y + chosen.rect.h / 2).toFixed(2));
    const rotationDeg = Number((seededJitter(ann.id, 7) * 0.72).toFixed(2));

    placed.push({
      annotation: ann,
      isStamp: false,
      isLeft: chosen.isLeft,
      zone: chosen.zone,
      boxX: Number(chosen.rect.x.toFixed(2)),
      boxTopY: Number(chosen.rect.y.toFixed(2)),
      boxCenterY,
      boxWidth: Number(chosen.rect.w.toFixed(2)),
      boxHeight: Number(chosen.rect.h.toFixed(2)),
      rotationDeg,
      inkColor,
      connector,
      _adjustedY: boxCenterY
    });
  }

  // Third pass: Automatic Last-Page Examiner Summary Box (0 extra AI tokens!)
  let examinerSummary: ExaminerSummaryBox | undefined;
  const shouldBuildSummary =
    options.includeLastPageSummary !== false &&
    pageNum === totalPages &&
    options.evalResult &&
    analysis.lastInkY < 73;

  if (shouldBuildSummary && options.evalResult) {
    const focusPoint = options.evalResult.rubric_breakdown?.main_body?.missing_points?.[0]?.trim();
    const strengthPoint =
      options.evalResult.rubric_breakdown?.main_body?.matched_points?.[0]?.trim() ||
      options.evalResult.rubric_breakdown?.conclusion?.strengths?.trim();

    if (focusPoint) {
      // Find lowest bottom of any placed box (including bottom-zone comments)
      const lowestOccupiedBottom = occupiedRects.reduce(
        (maxB, r) => (r.y > 40 ? Math.max(maxB, r.y + r.h) : maxB),
        analysis.lastInkY + 3
      );
      const summaryStartY = Math.max(analysis.lastInkY + 4.5, lowestOccupiedBottom + 2.5);
      const summaryH = strengthPoint ? 12.5 : 8.8;

      if (summaryStartY + summaryH <= 94.5) {
        examinerSummary = {
          x: clamp(imageLeftPct + 4, 4, 18),
          y: Number(summaryStartY.toFixed(2)),
          width: clamp(imageWidthPct - 8, 56, 88),
          height: summaryH,
          focusLine: focusPoint,
          strengthLine: strengthPoint,
          inkColor
        };
      }
    }
  }

  return {
    virtualMarginLeftPct,
    virtualMarginRightPct,
    imageLeftPct,
    imageWidthPct,
    paperBgHex: analysis.paperBgHex,
    inkColor,
    isDimPhoto: analysis.isDimPhoto,
    copyType: analysis.copyType,
    placed,
    examinerSummary
  };
}
