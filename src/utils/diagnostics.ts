import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';

export interface DiagnosticEngine {
  readonly name: string;
  readonly supportedLanguages: readonly string[];
  run(view: EditorView): Diagnostic[];
}

export interface FileTier {
  readonly label: string;
  readonly maxBytes: number;
  readonly pollIntervalMs: number;
  readonly skip: boolean;
}

const tiers: FileTier[] = [
  { label: 'small', maxBytes: 100_000, pollIntervalMs: 300, skip: false },
  { label: 'medium', maxBytes: 500_000, pollIntervalMs: 500, skip: false },
  { label: 'large', maxBytes: 2_000_000, pollIntervalMs: 1000, skip: false },
  { label: 'xlarge', maxBytes: Infinity, pollIntervalMs: 0, skip: true },
];

export function getFileTier(docLength: number): FileTier {
  for (const tier of tiers) {
    if (docLength <= tier.maxBytes) return tier;
  }
  return tiers[tiers.length - 1];
}

export function getPollInterval(docLength: number): number {
  return getFileTier(docLength).pollIntervalMs;
}

export function shouldSkipDiagnostics(docLength: number): boolean {
  return getFileTier(docLength).skip;
}

const engines = new Map<string, DiagnosticEngine>();

export function registerDiagnosticEngine(engine: DiagnosticEngine): void {
  for (const lang of engine.supportedLanguages) {
    engines.set(lang, engine);
  }
}

export function getDiagnosticEngine(language: string): DiagnosticEngine | undefined {
  return engines.get(language);
}

export function hasDiagnosticEngine(language: string): boolean {
  return engines.has(language);
}
