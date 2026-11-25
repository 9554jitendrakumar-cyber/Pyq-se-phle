/**
 * Autonomous Page Whitespace & Ink Occupancy Analyzer (Client-Side, 0 AI Tokens)
 *
 * Scans any uploaded UPSC answer sheet image (standard booklet, narrow margin,
 * one-sided margin, tightly cropped zero-margin phone photo, ruled notebook,
 * dim shadow photo, or half-blank last page) on a compact low-res canvas (~15ms)
 * to produce a normalized 2D ink occupancy map, per-row handwriting edges,
 * internal empty pockets (paragraph gaps & short-line pockets), and paper tone.
 */

export type CopyLayoutType =
  | 'wide_margin'
  | 'one_sided_margin'
  | 'narrow_margin'
  | 'zero_margin'
  | 'half_blank';

export interface RowInkBounds {
  /** Leftmost handwritten ink X% on this row (0..100) */
  startX: number;
  /** Rightmost handwritten ink X% on this row (0..100) */
  endX: number;
  /** True if meaningful handwritten/printed content exists on this row */
  hasInk: boolean;
  /** Fraction of cells in this row that have ink (0..1) */
  density: number;
}

export interface EmptyPocket {
  id: string;
  zone: 'gap' | 'short_line_right' | 'top' | 'bottom';
  x: number; // 0..100 (% of original image width)
  y: number; // 0..100 (% of original image height)
  width: number; // %
  height: number; // %
  area: number;
}

export interface PageGeometryAnalysis {
  gridCols: number;
  gridRows: number;
  /** Flattened gridCols * gridRows Uint8Array: 1 = ink, 0 = free paper */
  occupancy: Uint8Array;
  /** Per-row (0..99%) handwriting left/right ink bounds */
  rowInkBounds: RowInkBounds[];
  /** Cleanly free left margin width (% of page width, 0..24) */
  leftMarginWidth: number;
  /** Cleanly free right margin width (% of page width, 0..24) */
  rightMarginWidth: number;
  /** First Y% where substantial ink appears */
  firstInkY: number;
  /** Last Y% where substantial ink appears */
  lastInkY: number;
  /** Detected internal empty pockets (paragraph gaps, short-line right gaps, top, bottom) */
  emptyPockets: EmptyPocket[];
  /** Classified copy layout type */
  copyType: CopyLayoutType;
  /** Sampled paper background color for seamless virtual margin matching */
  paperBgHex: string;
  /** True if paper background is dim/grey phone photo (needs slightly brighter ink contrast) */
  isDimPhoto: boolean;
  /** Average paper luminance (0..255) */
  paperLuminance: number;
  /** Confidence (0..1) of the scan; low confidence triggers safe fallback */
  confidence: number;
}

const GRID_COLS = 100;
const GRID_ROWS = 140;

const analysisCache = new Map<string, PageGeometryAnalysis>();
const pendingCache = new Map<string, Promise<PageGeometryAnalysis>>();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Fallback geometry used for MOCK_ demo sheets or when an image cannot be read (e.g. tainted canvas).
 */
export function createFallbackPageAnalysis(isMockSheet: boolean = false): PageGeometryAnalysis {
  const occupancy = new Uint8Array(GRID_COLS * GRID_ROWS);
  const rowInkBounds: RowInkBounds[] = [];

  for (let y = 0; y < 100; y++) {
    const hasInk = isMockSheet ? y >= 12 && y <= 84 : y >= 14 && y <= 88;
    rowInkBounds.push({
      startX: hasInk ? 15 : 100,
      endX: hasInk ? 85 : 0,
      hasInk,
      density: hasInk ? 0.35 : 0
    });
  }

  if (isMockSheet) {
    for (let gy = Math.floor(GRID_ROWS * 0.12); gy < Math.floor(GRID_ROWS * 0.84); gy++) {
      for (let gx = 15; gx < 85; gx++) {
        occupancy[gy * GRID_COLS + gx] = 1;
      }
    }
  }

  return {
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    occupancy,
    rowInkBounds,
    leftMarginWidth: isMockSheet ? 14 : 13,
    rightMarginWidth: isMockSheet ? 14 : 13,
    firstInkY: isMockSheet ? 12 : 14,
    lastInkY: isMockSheet ? 84 : 88,
    emptyPockets: [],
    copyType: 'wide_margin',
    paperBgHex: '#ffffff',
    isDimPhoto: false,
    paperLuminance: 248,
    confidence: isMockSheet ? 0.9 : 0.45
  };
}

/**
 * Helper: queries fraction of ink cells in an arbitrary rectangular region (in 0..100% coords).
 */
export function getRegionInkRatio(
  analysis: PageGeometryAnalysis,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number
): number {
  const x0 = clamp(Math.floor((xPct / 100) * analysis.gridCols), 0, analysis.gridCols - 1);
  const x1 = clamp(Math.ceil(((xPct + wPct) / 100) * analysis.gridCols), x0 + 1, analysis.gridCols);
  const y0 = clamp(Math.floor((yPct / 100) * analysis.gridRows), 0, analysis.gridRows - 1);
  const y1 = clamp(Math.ceil(((yPct + hPct) / 100) * analysis.gridRows), y0 + 1, analysis.gridRows);

  let ink = 0;
  let total = 0;
  for (let gy = y0; gy < y1; gy++) {
    const rowOff = gy * analysis.gridCols;
    for (let gx = x0; gx < x1; gx++) {
      if (analysis.occupancy[rowOff + gx] === 1) ink++;
      total++;
    }
  }
  return total > 0 ? ink / total : 0;
}

/**
 * Helper: samples fraction of ink cells along a quadratic Bezier path (used to avoid spaghetti arrows).
 */
export function getCurveCrossedInkRatio(
  analysis: PageGeometryAnalysis,
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  steps: number = 22
): number {
  let inkHits = 0;
  let samples = 0;
  // Ignore the very first 12% and last 12% (leaving box edge and arriving at ink edge)
  for (let i = 3; i <= steps - 3; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const px = inv * inv * sx + 2 * inv * t * cx + t * t * tx;
    const py = inv * inv * sy + 2 * inv * t * cy + t * t * ty;
    const gx = clamp(Math.round((px / 100) * (analysis.gridCols - 1)), 0, analysis.gridCols - 1);
    const gy = clamp(Math.round((py / 100) * (analysis.gridRows - 1)), 0, analysis.gridRows - 1);
    if (analysis.occupancy[gy * analysis.gridCols + gx] === 1) {
      inkHits++;
    }
    samples++;
  }
  return samples > 0 ? inkHits / samples : 0;
}

/**
 * Runs core pixel-level adaptive ink segmentation directly on an HTMLImageElement.
 */
export function analyzeImageElement(img: HTMLImageElement): PageGeometryAnalysis {
  if (typeof document === 'undefined' || !img.naturalWidth || !img.naturalHeight) {
    return createFallbackPageAnalysis(false);
  }

  // Downsample to compact analysis canvas (200x280) for ~12ms speed & natural noise smoothing
  const W = 200;
  const H = 280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return createFallbackPageAnalysis(false);

  try {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H).data;

    // 1. Compute grayscale luminance + sample interior paper color
    const lum = new Uint8Array(W * H);
    const sat = new Uint8Array(W * H);
    const rSamples: number[] = [];
    const gSamples: number[] = [];
    const bSamples: number[] = [];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        const r = imgData[p];
        const g = imgData[p + 1];
        const b = imgData[p + 2];
        const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        lum[y * W + x] = l;
        sat[y * W + x] = mx - mn;

        // Sample interior pixels (avoid outer 6% camera border) for paper background estimation
        if (x % 4 === 0 && y % 4 === 0 && x > W * 0.06 && x < W * 0.94 && y > H * 0.06 && y < H * 0.94) {
          rSamples.push(r);
          gSamples.push(g);
          bSamples.push(b);
        }
      }
    }

    // 78th percentile bright pixel represents true paper tone (ignores ink & dark lines)
    const p78 = (arr: number[]) => {
      if (arr.length === 0) return 245;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.78))];
    };
    const paperR = p78(rSamples);
    const paperG = p78(gSamples);
    const paperB = p78(bSamples);
    const paperLuminance = Math.round(0.299 * paperR + 0.587 * paperG + 0.114 * paperB);
    const isDimPhoto = paperLuminance < 190;
    // Slightly soften paper tint toward clean warm paper if dim photo is very grey
    const paperBgHex =
      paperLuminance < 150
        ? '#eceae4'
        : rgbToHex(
            Math.min(255, paperR + 4),
            Math.min(255, paperG + 4),
            Math.min(255, paperB + 4)
          );

    // 2. Local adaptive tile background (10x14 tiles) to cancel shadows & uneven phone lighting
    const TILE_X = 10;
    const TILE_Y = 14;
    const tileW = W / TILE_X;
    const tileH = H / TILE_Y;
    const tileBg = new Float32Array(TILE_X * TILE_Y);

    for (let ty = 0; ty < TILE_Y; ty++) {
      for (let tx = 0; tx < TILE_X; tx++) {
        const vals: number[] = [];
        const xStart = Math.floor(tx * tileW);
        const xEnd = Math.min(W, Math.ceil((tx + 1) * tileW));
        const yStart = Math.floor(ty * tileH);
        const yEnd = Math.min(H, Math.ceil((ty + 1) * tileH));
        for (let y = yStart; y < yEnd; y += 2) {
          for (let x = xStart; x < xEnd; x += 2) {
            vals.push(lum[y * W + x]);
          }
        }
        vals.sort((a, b) => a - b);
        tileBg[ty * TILE_X + tx] = vals.length > 0 ? vals[Math.floor(vals.length * 0.8)] : paperLuminance;
      }
    }

    // Bilinear local background lookup
    const getLocalBg = (x: number, y: number): number => {
      const fx = clamp((x / W) * TILE_X - 0.5, 0, TILE_X - 1);
      const fy = clamp((y / H) * TILE_Y - 0.5, 0, TILE_Y - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(TILE_X - 1, x0 + 1);
      const y1 = Math.min(TILE_Y - 1, y0 + 1);
      const dx = fx - x0;
      const dy = fy - y0;
      const v00 = tileBg[y0 * TILE_X + x0];
      const v10 = tileBg[y0 * TILE_X + x1];
      const v01 = tileBg[y1 * TILE_X + x0];
      const v11 = tileBg[y1 * TILE_X + x1];
      return (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
    };

    // 3. Pixel-level ink classification (ignore faint ruled lines, light red margin lines, outer 2% border)
    const inkMask = new Uint8Array(W * H);
    const borderX = Math.floor(W * 0.02);
    const borderY = Math.floor(H * 0.02);
    const deltaThreshold = isDimPhoto ? 24 : 30;

    for (let y = borderY; y < H - borderY; y++) {
      for (let x = borderX; x < W - borderX; x++) {
        const idx = y * W + x;
        const localBg = getLocalBg(x, y);
        const drop = localBg - lum[idx];
        const p = idx * 4;
        const r = imgData[p];
        const g = imgData[p + 1];
        const b = imgData[p + 2];

        // Ignore pale pink/red printed UPSC margin lines (high R, lower G/B, modest darkness)
        const isPaleRedMarginLine = r > g + 22 && r > b + 22 && lum[idx] > localBg - 68;
        // Ignore faint cyan/sky-blue ruled notebook lines
        const isFaintRuledLine = b > r + 14 && lum[idx] > localBg - 48 && sat[idx] < 65;

        if (drop >= deltaThreshold && !isPaleRedMarginLine && !isFaintRuledLine) {
          inkMask[idx] = 1;
        }
      }
    }

    // 4. Filter out continuous thin printed vertical margin lines & horizontal ruled lines
    // If a single 1-2px vertical column has ink across >65% of page height with empty immediate neighbors, clear it
    for (let x = 2; x < W - 2; x++) {
      let colInk = 0;
      let isolatedColInk = 0;
      for (let y = borderY; y < H - borderY; y++) {
        if (inkMask[y * W + x] === 1) {
          colInk++;
          if (inkMask[y * W + (x - 2)] === 0 && inkMask[y * W + (x + 2)] === 0) {
            isolatedColInk++;
          }
        }
      }
      if (colInk > H * 0.62 && isolatedColInk > colInk * 0.65) {
        for (let y = borderY; y < H - borderY; y++) {
          inkMask[y * W + x] = 0;
        }
      }
    }

    // Same for continuous thin horizontal ruled lines
    for (let y = 2; y < H - 2; y++) {
      let rowInk = 0;
      let isolatedRowInk = 0;
      for (let x = borderX; x < W - borderX; x++) {
        if (inkMask[y * W + x] === 1) {
          rowInk++;
          if (inkMask[(y - 2) * W + x] === 0 && inkMask[(y + 2) * W + x] === 0) {
            isolatedRowInk++;
          }
        }
      }
      if (rowInk > W * 0.68 && isolatedRowInk > rowInk * 0.7) {
        for (let x = borderX; x < W - borderX; x++) {
          inkMask[y * W + x] = 0;
        }
      }
    }

    // 5. Build 100x140 occupancy grid (each cell is 2x2 pixels in 200x280 space)
    const rawOcc = new Uint8Array(GRID_COLS * GRID_ROWS);
    let totalInkCells = 0;
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const px0 = gx * 2;
        const py0 = gy * 2;
        let hits = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            if (inkMask[(py0 + dy) * W + (px0 + dx)] === 1) hits++;
          }
        }
        if (hits >= 1) {
          rawOcc[gy * GRID_COLS + gx] = 1;
          totalInkCells++;
        }
      }
    }

    // Light 1-cell morphological dilation (only horizontally 1 cell) + remove isolated 1-cell speckles
    const occupancy = new Uint8Array(GRID_COLS * GRID_ROWS);
    for (let gy = 1; gy < GRID_ROWS - 1; gy++) {
      for (let gx = 1; gx < GRID_COLS - 1; gx++) {
        const idx = gy * GRID_COLS + gx;
        if (rawOcc[idx] === 1) {
          // Check 8-neighborhood to suppress tiny isolated dust speckles
          const neighbors =
            rawOcc[idx - 1] +
            rawOcc[idx + 1] +
            rawOcc[idx - GRID_COLS] +
            rawOcc[idx + GRID_COLS] +
            rawOcc[idx - GRID_COLS - 1] +
            rawOcc[idx - GRID_COLS + 1] +
            rawOcc[idx + GRID_COLS - 1] +
            rawOcc[idx + GRID_COLS + 1];
          if (neighbors >= 1) {
            occupancy[idx] = 1;
          }
        }
      }
    }

    // 6. Compute per-row (0..99%) ink bounds
    const rowInkBounds: RowInkBounds[] = [];
    let firstInkY = 100;
    let lastInkY = 0;

    for (let yPct = 0; yPct < 100; yPct++) {
      const gyStart = clamp(Math.floor((yPct / 100) * GRID_ROWS), 0, GRID_ROWS - 1);
      const gyEnd = clamp(Math.ceil(((yPct + 1) / 100) * GRID_ROWS), gyStart + 1, GRID_ROWS);

      let startX = 100;
      let endX = 0;
      let inkCount = 0;
      let totalCells = 0;

      // Scan from x=3..96 to ignore stray scanner shadow right at 0-2% / 98-99%
      for (let gx = 3; gx < GRID_COLS - 3; gx++) {
        let cellHasInk = false;
        for (let gy = gyStart; gy < gyEnd; gy++) {
          if (occupancy[gy * GRID_COLS + gx] === 1) {
            cellHasInk = true;
            break;
          }
        }
        totalCells++;
        if (cellHasInk) {
          inkCount++;
          if (gx < startX) startX = gx;
          if (gx > endX) endX = gx;
        }
      }

      const hasInk = inkCount >= 3 && endX - startX >= 4;
      if (hasInk) {
        if (yPct < firstInkY) firstInkY = yPct;
        if (yPct > lastInkY) lastInkY = yPct;
      }

      rowInkBounds.push({
        startX: hasInk ? startX : 100,
        endX: hasInk ? endX : 0,
        hasInk,
        density: totalCells > 0 ? inkCount / totalCells : 0
      });
    }

    if (firstInkY > lastInkY) {
      firstInkY = 12;
      lastInkY = 85;
    }

    // 7. Measure clean left & right margin widths across active writing rows (15%..90% of ink span)
    const activeRows = rowInkBounds.filter(
      (r, idx) => r.hasInk && idx >= Math.max(8, firstInkY) && idx <= Math.min(94, lastInkY)
    );
    let leftMarginWidth = 0;
    let rightMarginWidth = 0;

    if (activeRows.length >= 4) {
      const starts = activeRows.map((r) => r.startX).sort((a, b) => a - b);
      const ends = activeRows.map((r) => r.endX).sort((a, b) => a - b);
      // Use 15th percentile of startX and 85th percentile of endX so 1-2 stray bullets don't shrink whole margin
      const p15Start = starts[Math.floor(starts.length * 0.15)];
      const p85End = ends[Math.min(ends.length - 1, Math.floor(ends.length * 0.85))];
      leftMarginWidth = clamp(p15Start - 1.5, 0, 24);
      rightMarginWidth = clamp(100 - p85End - 1.5, 0, 24);
    }

    // 8. Detect internal empty pockets (paragraph gaps, short-line right gaps, top & bottom whitespace)
    const emptyPockets: EmptyPocket[] = [];
    let pocketCounter = 0;

    const tempAnalysisForCheck: PageGeometryAnalysis = {
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      occupancy,
      rowInkBounds,
      leftMarginWidth,
      rightMarginWidth,
      firstInkY,
      lastInkY,
      emptyPockets,
      copyType: 'wide_margin',
      paperBgHex,
      isDimPhoto,
      paperLuminance,
      confidence: 0.9
    };

    // 8a. Bottom whitespace zone (if bottom >= 16% is free)
    if (lastInkY < 80) {
      const bottomY = Math.min(82, lastInkY + 3.5);
      const bottomH = Math.max(0, 94.5 - bottomY);
      if (bottomH >= 11) {
        // Split bottom into up to 2 clean side-by-side zones (left half & right half)
        emptyPockets.push({
          id: `pocket-${pocketCounter++}`,
          zone: 'bottom',
          x: 4,
          y: bottomY,
          width: 44,
          height: bottomH,
          area: 44 * bottomH
        });
        emptyPockets.push({
          id: `pocket-${pocketCounter++}`,
          zone: 'bottom',
          x: 52,
          y: bottomY,
          width: 44,
          height: bottomH,
          area: 44 * bottomH
        });
      }
    }

    // 8b. Top whitespace zone (left of Page 1 marks circle)
    if (firstInkY > 17) {
      const topH = firstInkY - 5;
      if (topH >= 9) {
        emptyPockets.push({
          id: `pocket-${pocketCounter++}`,
          zone: 'top',
          x: 4,
          y: 3.5,
          width: 72,
          height: topH,
          area: 72 * topH
        });
      }
    }

    // 8c. Inter-paragraph horizontal gaps (contiguous empty bands >= 5.5% height)
    let gapRunStart = -1;
    for (let y = Math.max(10, firstInkY + 2); y <= Math.min(90, lastInkY - 2); y++) {
      const rowClean = !rowInkBounds[y].hasInk || rowInkBounds[y].density < 0.025;
      if (rowClean) {
        if (gapRunStart === -1) gapRunStart = y;
      } else {
        if (gapRunStart !== -1) {
          const gapH = y - gapRunStart;
          if (gapH >= 5.5) {
            const xLeft = clamp(leftMarginWidth + 2, 6, 22);
            const xRight = clamp(100 - rightMarginWidth - 2, 76, 94);
            const w = xRight - xLeft;
            if (w >= 26) {
              emptyPockets.push({
                id: `pocket-${pocketCounter++}`,
                zone: 'gap',
                x: xLeft,
                y: gapRunStart + 0.8,
                width: w,
                height: gapH - 1.6,
                area: w * (gapH - 1.6)
              });
            }
          }
          gapRunStart = -1;
        }
      }
    }

    // 8d. Short-line / heading right-side empty pockets (like right of a short heading or half-ended paragraph)
    // Scan in 4% vertical slices inside writing body
    for (let y = Math.max(14, firstInkY); y <= Math.min(82, lastInkY - 6); y += 5) {
      const bandH = 8.5;
      // Try finding cleanest right-side empty rectangle of width 22..38%
      for (const candidateW of [34, 26, 20]) {
        const cx = 96 - candidateW;
        if (cx < 50) continue;
        // Skip Page 1 top-right marks circle danger zone
        if (y < 18 && cx + candidateW > 80) continue;
        const inkRatio = getRegionInkRatio(tempAnalysisForCheck, cx - 1, y - 0.5, candidateW + 2, bandH + 1);
        if (inkRatio <= 0.012) {
          // Ensure this row band actually has writing to the left of it (so it's a real short-line pocket)
          const leftInkRatio = getRegionInkRatio(tempAnalysisForCheck, 12, y, cx - 16, bandH);
          if (leftInkRatio >= 0.04) {
            emptyPockets.push({
              id: `pocket-${pocketCounter++}`,
              zone: 'short_line_right',
              x: cx,
              y,
              width: candidateW,
              height: bandH,
              area: candidateW * bandH
            });
            break;
          }
        }
      }
    }

    // 9. Classify copy layout type
    let copyType: CopyLayoutType = 'wide_margin';
    if (lastInkY < 62) {
      copyType = 'half_blank';
    } else if (leftMarginWidth >= 10.5 && rightMarginWidth >= 10.5) {
      copyType = 'wide_margin';
    } else if (
      (leftMarginWidth >= 10.5 && rightMarginWidth < 7.5) ||
      (rightMarginWidth >= 10.5 && leftMarginWidth < 7.5)
    ) {
      copyType = 'one_sided_margin';
    } else if (leftMarginWidth < 6.5 && rightMarginWidth < 6.5) {
      copyType = 'zero_margin';
    } else {
      copyType = 'narrow_margin';
    }

    const inkFraction = totalInkCells / (GRID_COLS * GRID_ROWS);
    // Very low (<0.005) or completely black (>0.65) indicates weird/corrupted scan → lower confidence
    const confidence = inkFraction >= 0.008 && inkFraction <= 0.6 ? 0.92 : 0.4;

    canvas.width = 0;
    canvas.height = 0;

    return {
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      occupancy,
      rowInkBounds,
      leftMarginWidth,
      rightMarginWidth,
      firstInkY,
      lastInkY,
      emptyPockets,
      copyType,
      paperBgHex,
      isDimPhoto,
      paperLuminance,
      confidence
    };
  } catch (err) {
    console.warn('Page whitespace scan fallback:', err);
    canvas.width = 0;
    canvas.height = 0;
    return createFallbackPageAnalysis(false);
  }
}

export function getCachedPageAnalysis(cacheKey: string): PageGeometryAnalysis | undefined {
  return analysisCache.get(cacheKey);
}

/**
 * Loads an image dataUrl/URL and returns its cached PageGeometryAnalysis.
 */
export function analyzePageImage(dataUrl: string, cacheKey?: string): Promise<PageGeometryAnalysis> {
  const key = cacheKey || dataUrl.slice(0, 120);
  if (analysisCache.has(key)) {
    return Promise.resolve(analysisCache.get(key)!);
  }
  if (pendingCache.has(key)) {
    return pendingCache.get(key)!;
  }

  if (!dataUrl || dataUrl.startsWith('MOCK_')) {
    const mockAnalysis = createFallbackPageAnalysis(true);
    analysisCache.set(key, mockAnalysis);
    return Promise.resolve(mockAnalysis);
  }

  const promise = new Promise<PageGeometryAnalysis>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const result = analyzeImageElement(img);
      analysisCache.set(key, result);
      pendingCache.delete(key);
      resolve(result);
    };
    img.onerror = () => {
      const fallback = createFallbackPageAnalysis(false);
      analysisCache.set(key, fallback);
      pendingCache.delete(key);
      resolve(fallback);
    };
    img.src = dataUrl;
  });

  pendingCache.set(key, promise);
  return promise;
}
