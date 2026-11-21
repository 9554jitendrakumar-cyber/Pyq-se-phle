import type { UploadedPage } from '../types/evaluation';

/**
 * Renders plain text answers into UPSC-styled answer sheet image pages.
 */
export function generateTextAnswerPages(text: string, title: string = 'Text_Answer'): UploadedPage[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  canvas.width = 1200;
  canvas.height = 1600;

  const drawBlankUpscSheet = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw margins (UPSC style)
    ctx.strokeStyle = '#ff9999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 0);
    ctx.lineTo(150, canvas.height); // Left margin
    ctx.moveTo(1050, 0);
    ctx.lineTo(1050, canvas.height); // Right margin
    ctx.stroke();

    ctx.font = '28px "Courier New", Courier, monospace';
    ctx.fillStyle = '#000000';
  };

  drawBlankUpscSheet();

  const lines = text.split('\n');
  let y = 80;
  const x = 170; // Inside left margin
  const maxWidth = 860; // Between margins
  const lineHeight = 40;

  const textPages: UploadedPage[] = [];
  let pageNum = 1;

  const createPage = () => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
    textPages.push({
      id: `txt-page-${Date.now()}-${pageNum}`,
      name: `${title} - Page ${pageNum}`,
      dataUrl,
    });
    drawBlankUpscSheet();
    y = 80;
    pageNum++;
  };

  lines.forEach((line) => {
    const words = line.split(' ');
    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(currentLine, x, y);
        y += lineHeight;
        if (y > canvas.height - 80) createPage();
        currentLine = words[i] + ' ';
      } else {
        currentLine = testLine;
      }
    }
    ctx.fillText(currentLine, x, y);
    y += lineHeight;
    if (y > canvas.height - 80) createPage();
  });

  if (y > 80) createPage();

  canvas.width = 0;
  canvas.height = 0;
  return textPages;
}

