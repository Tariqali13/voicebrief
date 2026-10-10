'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingRow } from '@/lib/meetings';
import type { Segment } from '@/lib/ai/transcribe';
import { deleteAudio, loadAudio } from '@/lib/client/audioStore';
import { clock, duration, shortDate } from '@/lib/format';
import { AskPanel } from './AskPanel';

interface Props {
  meeting: MeetingRow & { segments: Segment[] };
  initialTime: number | null;
}

export function MeetingView({ meeting, initialTime }: Props) {
  const router = useRouter();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [now, setNow] = useState<number>(-1);
  const audio = useRef<HTMLAudioElement>(null);
  const lines = useRef<(HTMLSpanElement | null)[]>([]);
  const s = meeting.summary;

  useEffect(() => {
    let url: string | null = null;
    loadAudio(meeting.id).then((blob) => {
      if (blob) setAudioUrl((url = URL.createObjectURL(blob)));
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [meeting.id]);

  const indexAt = useCallback(
    (sec: number) => {
      const i = meeting.segments.findIndex((seg) => sec >= seg.start && sec < seg.end);
      return i >= 0 ? i : meeting.segments.findIndex((seg) => seg.start >= sec);
    },
    [meeting.segments],
  );

  /** Highlight the cited lines, scroll them into view, and play from there if we have the audio. */
  const show = useCallback(
    (evidence: number[], play = true) => {
      setLit(new Set(evidence));
      lines.current[evidence[0]!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const seg = meeting.segments[evidence[0]!];
      if (play && seg && audio.current) {
        audio.current.currentTime = seg.start;
        void audio.current.play().catch(() => undefined);
      }
    },
    [meeting.segments],
  );

  const seek = useCallback((sec: number) => show([Math.max(0, indexAt(sec))]), [indexAt, show]);

  useEffect(() => {
    if (initialTime !== null) seek(initialTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, []);

  const usage = meeting.usage as { promptTokens?: number; completionTokens?: number; timingsMs?: Record<string, number>; models?: Record<string, string> };
  const seconds = useMemo(() => Object.values(usage.timingsMs ?? {}).reduce((a, b) => a + b, 0) / 1000, [usage.timingsMs]);

  async function remove() {
    if (!window.confirm('Delete this meeting and its notes? This can’t be undone.')) return;
    await fetch(`/api/meetings/${meeting.id}`, { method: 'DELETE' });
    await deleteAudio(meeting.id);
    router.push('/');
    router.refresh();
  }

  const Cites = ({ evidence }: { evidence: number[] }) => (
    <span className="cites">
      {evidence.slice(0, 4).map((n) => (
        <button key={n} className="cite mono" onClick={() => show([n])} aria-label={`Show where this was said, at ${clock(meeting.segments[n]?.start ?? 0)}`}>
          {clock(meeting.segments[n]?.start ?? 0)}
        </button>
      ))}
    </span>
  );

  return (
    <>
      <header className="meeting-head">
        <h1>{meeting.title}</h1>
        <div className="meta-line mono">
          <span>{shortDate(meeting.createdAt)}</span>
          <span>{duration(meeting.durationSec)}</span>
          {meeting.status === 'ready' && seconds >= 0.1 && <span>notes in {seconds.toFixed(1)} s</span>}
          {(usage.promptTokens ?? 0) > 0 && <span>{((usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)).toLocaleString()} tokens</span>}
          {usage.models?.chat && <span title="Models used">{usage.models.chat}</span>}
          {meeting.droppedItems > 0 && (
            <span title="Items the model produced that weren't supported by the transcript were removed">{meeting.droppedItems} unsupported item(s) removed</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {audioUrl ? (
            <audio
              ref={audio}
              controls
              src={audioUrl}
              onTimeUpdate={(e) => setNow(indexAt(e.currentTarget.currentTime))}
            />
          ) : (
            meeting.source !== 'sample' && <span className="meta-line">The recording is only kept on the device that made it.</span>
          )}
          <button className="btn quiet" onClick={remove}>
            Delete
          </button>
        </div>
      </header>

      {meeting.status === 'failed' && <p className="notice">{meeting.error}</p>}
      {meeting.status === 'processing' && <p className="notice">Still processing. Refresh in a moment.</p>}

      {s && (
        <div className="meeting">
          <div className="notes">
            <section>
              <h2>In short</h2>
              <p className="tldr">{s.tldr}</p>
            </section>

            {s.decisions.length > 0 && (
              <section>
                <h2>Decided</h2>
                <ul className="items decisions">
                  {s.decisions.map((d, i) => (
                    <li key={i}>
                      <span>{d.text}</span>
                      <Cites evidence={d.evidence} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {s.actionItems.length > 0 && (
              <section>
                <h2>To do</h2>
                <ul className="items">
                  {s.actionItems.map((a, i) => (
                    <li key={i}>
                      <span>{a.task}</span>
                      <span className="who">
                        <strong>{a.owner ?? 'No owner named'}</strong>
                        {a.due ? `, ${a.due}` : ''}
                      </span>
                      <Cites evidence={a.evidence} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {s.openQuestions.length > 0 && (
              <section>
                <h2>Still open</h2>
                <ul className="items">
                  {s.openQuestions.map((q, i) => (
                    <li key={i}>
                      <span>{q.text}</span>
                      <Cites evidence={q.evidence} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2>Ask about this meeting</h2>
              <AskPanel meetingId={meeting.id} onSeek={seek} />
            </section>
          </div>

          <div className="pad transcript" aria-label="Transcript">
            {meeting.segments.map((seg, i) => (
              <span
                key={i}
                ref={(el) => {
                  lines.current[i] = el;
                }}
                className={`line${lit.has(i) ? ' lit' : ''}${now === i ? ' now' : ''}`}
                onClick={() => show([i])}
              >
                <span className="t mono">{clock(seg.start)}</span>
                {seg.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
