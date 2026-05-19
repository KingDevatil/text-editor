import type { LineEnding } from '../types';

const SAMPLE_SIZE = 8192; // 8KB sample for fast detection on large files

function countLineEndings(text: string): { crlf: number; cr: number; lf: number } {
  const crlf = (text.match(/\r\n/g) || []).length;
  const cr = (text.match(/\r(?!\n)/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return { crlf, cr, lf };
}

export function detectLineEnding(text: string): LineEnding {
  if (text.length <= SAMPLE_SIZE) {
    const { crlf, cr, lf } = countLineEndings(text);
    const hasCRLF = crlf > 0;
    const hasCR = cr > 0;
    const hasLF = lf > 0;
    if (hasCRLF && !hasCR && !hasLF) return 'CRLF';
    if (!hasCRLF && hasCR && !hasLF) return 'CR';
    if (!hasCRLF && !hasCR && hasLF) return 'LF';
    if (hasCRLF || hasCR || hasLF) return 'Mixed';
    return 'LF';
  }

  // Large file: sample first, then fall back to full scan when necessary.
  const sample = text.slice(0, SAMPLE_SIZE);
  const { crlf, cr, lf } = countLineEndings(sample);

  // If the sample ends with '\r', it may be part of a CRLF split at the
  // boundary. Treat it as ambiguous so we verify with a full scan.
  const endsWithCR = sample.charCodeAt(sample.length - 1) === 13;

  const sampleMixed =
    (crlf > 0 && cr > 0) ||
    (crlf > 0 && lf > 0) ||
    (cr > 0 && lf > 0);

  // If the sample is clearly mixed (and not just a split boundary), we can
  // return Mixed immediately without scanning the whole file.
  if (sampleMixed && !endsWithCR) return 'Mixed';

  // Sample looks uniform or ends with a potentially-split CR.
  // Verify with a full scan to avoid mis-classification.
  const full = countLineEndings(text);
  const fHasCRLF = full.crlf > 0;
  const fHasCR = full.cr > 0;
  const fHasLF = full.lf > 0;
  if (fHasCRLF && !fHasCR && !fHasLF) return 'CRLF';
  if (!fHasCRLF && fHasCR && !fHasLF) return 'CR';
  if (!fHasCRLF && !fHasCR && fHasLF) return 'LF';
  if (fHasCRLF || fHasCR || fHasLF) return 'Mixed';
  return 'LF';
}
