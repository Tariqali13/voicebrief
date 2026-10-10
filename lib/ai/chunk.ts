import type { Segment } from './transcribe';

export interface Chunk {
  index: number;
  segmentFrom: number;
  segmentTo: number; // inclusive
  start: number;
  end: number;
  text: string;
}

/**
 * Retrieval chunks follow the conversation rather than a fixed character count:
 * consecutive segments are grouped into windows of about `targetChars`, never
 * splitting a segment, and each window repeats the previous window's last segment
 * so an answer that spans a boundary is still retrievable.
 */
export function chunkSegments(segments: Segment[], targetChars = 900, maxSeconds = 90): Chunk[] {
  const chunks: Chunk[] = [];
  let from = 0;
  while (from < segments.length) {
    let to = from;
    let chars = segments[from]!.text.length;
    while (
      to + 1 < segments.length &&
      chars + segments[to + 1]!.text.length <= targetChars &&
      segments[to + 1]!.end - segments[from]!.start <= maxSeconds
    ) {
      to++;
      chars += segments[to]!.text.length + 1;
    }
    chunks.push({
      index: chunks.length,
      segmentFrom: from,
      segmentTo: to,
      start: segments[from]!.start,
      end: segments[to]!.end,
      text: segments
        .slice(from, to + 1)
        .map((s) => s.text)
        .join(' '),
    });
    if (to + 1 >= segments.length) break;
    from = to > from ? to : to + 1; // overlap by one segment
  }
  return chunks;
}
