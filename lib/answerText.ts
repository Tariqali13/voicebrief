/**
 * The Ask panel renders answers as plain text (with clickable citations). The prompt
 * asks for plain text, but some models still emit Markdown, so this turns the common
 * cases into readable plain text: bold/italic markers and headings are dropped, and
 * table rows become "- cell — cell" lines. Safe on partial (streaming) text.
 *
 * Client-safe: no server-only imports.
 */
export function plainAnswer(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim();
      // Table separator rows like |---|:--:|
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed)) return [];
      // Table rows: | a | b | c |
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        return cells.length ? [`- ${cells.join(' — ')}`] : [];
      }
      return [line.replace(/^#{1,6}\s+/, '')];
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S[^*\n]*?\S|\S)\*(?=\s|[.,;:!?)]|$)/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n');
}
