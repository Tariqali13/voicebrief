/**
 * Models don't agree on citation style: some write `[S1][S2]`, others group them as
 * `[S1, S2]` or `[S1; S2]`. Normalise to one bracket per label so the server's
 * cited list and the UI's clickable citations see the same thing.
 *
 * Shared by the server (lib/ai/answer.ts) and the client (AskPanel), so it must stay
 * free of server-only imports.
 */
export function normalizeCitations(text: string): string {
  return text.replace(/\[\s*(S\d+(?:\s*[,;]\s*S\d+)+)\s*\]/g, (_m, group: string) =>
    group
      .split(/\s*[,;]\s*/)
      .map((ref) => `[${ref}]`)
      .join(''),
  );
}
