const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024;

export function shouldOptimizeLargeFile(
  largeFileOptimize: boolean,
  forceLargeFile: boolean,
  contentLength: number,
): boolean {
  // `forceLargeFile` is set by the file opener after checking the on-disk byte
  // size. It is a safety classification, so expensive whole-document
  // extensions must stay disabled even when the optional automatic setting is
  // turned off.
  return forceLargeFile || (largeFileOptimize && contentLength > LARGE_FILE_THRESHOLD);
}
