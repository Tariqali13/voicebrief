'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { errorMessage, readNdjson } from '@/lib/client/stream';
import { clock } from '@/lib/format';
import type { Source } from '@/lib/ai/answer';

type Event = { type: 'sources'; sources: Source[] } | { type: 'text'; text: string } | { type: 'done'; cited: string[] } | { type: 'error'; message: string };

interface Props {
  meetingId?: string;
  suggestions?: string[];
  /** When asking inside a meeting, jump to the cited moment instead of navigating. */
  onSeek?: (sec: number) => void;
}

export function AskPanel({ meetingId, suggestions = [], onSeek }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [cited, setCited] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string, e?: FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3 || busy) return;
    setQuestion(q);
    setBusy(true);
    setAnswer('');
    setSources([]);
    setCited(null);
    setError(null);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q, meetingId }) });
      if (!res.ok) throw new Error(await errorMessage(res));
      for await (const ev of readNdjson<Event>(res)) {
        if (ev.type === 'sources') setSources(ev.sources);
        else if (ev.type === 'text') setAnswer((a) => a + ev.text);
        else if (ev.type === 'done') setCited(new Set(ev.cited));
        else if (ev.type === 'error') throw new Error(ev.message);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = cited ? [...sources].sort((a, b) => Number(cited.has(b.ref)) - Number(cited.has(a.ref))) : sources;

  return (
    <div className="ask">
      <form onSubmit={(e) => ask(question, e)}>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={meetingId ? 'Ask about this meeting' : 'Ask anything about your meetings'}
          aria-label="Question"
          maxLength={500}
        />
        <button className="btn primary" disabled={busy || question.trim().length < 3}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {!answer && !busy && suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {suggestions.map((s) => (
            <button key={s} className="btn quiet" style={{ fontWeight: 500 }} onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {(answer || busy) && (
        <div className="pad" aria-live="polite">
          <p className="answer">{renderCitations(answer, sources, onSeek) ?? (busy ? 'Reading your meetings…' : '')}</p>
        </div>
      )}
      {cited && shown.length > 0 && (
        <ol className="sources" aria-label="Sources">
          {shown.map((s) => (
            <li key={s.ref} data-cited={cited.has(s.ref)}>
              <span className="ref mono">{s.ref}</span>
              <span>
                {onSeek && meetingId === s.meetingId ? (
                  <button className="cite mono" onClick={() => onSeek(s.start)}>
                    {clock(s.start)}
                  </button>
                ) : (
                  <Link href={`/m/${s.meetingId}?t=${Math.floor(s.start)}`}>
                    <b>{s.meetingTitle}</b> <span className="mono">{clock(s.start)}</span>
                  </Link>
                )}
                <br />
                <span style={{ color: 'var(--graphite)' }}>{s.text.length > 220 ? `${s.text.slice(0, 220)}…` : s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Turn "[S2]" markers into clickable citations. */
function renderCitations(text: string, sources: Source[], onSeek?: (sec: number) => void) {
  if (!text) return null;
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  return text.split(/(\[S\d+\])/g).map((part, i) => {
    const ref = part.match(/^\[(S\d+)\]$/)?.[1];
    const s = ref ? byRef.get(ref) : undefined;
    if (!s) return <span key={i}>{part}</span>;
    return onSeek ? (
      <button key={i} className="cite mono" onClick={() => onSeek(s.start)} title={`${s.meetingTitle}, ${clock(s.start)}`}>
        {ref}
      </button>
    ) : (
      <Link key={i} className="cite mono" href={`/m/${s.meetingId}?t=${Math.floor(s.start)}`} title={`${s.meetingTitle}, ${clock(s.start)}`}>
        {ref}
      </Link>
    );
  });
}
