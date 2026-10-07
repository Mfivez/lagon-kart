/** Bound rendering detail, not authored dimensions. All loop layers share rows. */
export function loopMeshRows(loop: { start: number; end: number }): number {
  return Math.max(2, Math.min(512, Math.ceil((loop.end - loop.start) * 2)));
}
export function roadMeshRows(length: number, metresPerSegment = 2): number {
  return Math.max(2, Math.min(4096, Math.ceil(length / metresPerSegment)));
}
