import Link from 'next/link';
import { currentOwner } from '@/lib/owner';
import { listMeetings } from '@/lib/meetings';
import { duration, shortDate } from '@/lib/format';
import { SampleButton } from '@/components/SampleButton';
import { SAMPLE_MEETINGS } from '@/lib/samples';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const owner = await currentOwner();
  const meetings = owner ? await listMeetings(owner) : [];

  if (meetings.length === 0) {
    return (
      <section className="recorder" style={{ maxWidth: 720 }}>
        <h1>Notes you can check.</h1>
        <p className="lede">
          Record a meeting and VoiceBrief writes the notes: what was decided, who&apos;s doing what, and what&apos;s still open. Every item links to
          the exact moment it was said, so you can check it in two seconds. Then ask questions across all your meetings.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/record" className="btn primary">
            Record a meeting
          </Link>
          <SampleButton />
        </div>
        <p className="lede" style={{ fontSize: '0.9rem' }}>
          Your recordings stay in this browser. The server keeps only the transcript and the notes, under an anonymous id stored on this device.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '2rem' }}>Your meetings</h1>
        {meetings.filter((m) => m.source === 'sample' && m.status !== 'failed').length < SAMPLE_MEETINGS.length && <SampleButton quiet />}
      </div>
      <div className="pad">
        {meetings.map((m) => (
          <Link key={m.id} href={`/m/${m.id}`} className="pad-entry">
            <span className="when mono">{shortDate(m.createdAt)}</span>
            <span>
              <b>{m.title}</b>
              {m.status === 'ready' && m.summary && (
                <small>
                  {' '}
                  {m.summary.decisions.length} decision{m.summary.decisions.length === 1 ? '' : 's'}, {m.summary.actionItems.length} to-do
                  {m.summary.actionItems.length === 1 ? '' : 's'}
                </small>
              )}
            </span>
            {m.status === 'ready' ? (
              <small className="mono">{duration(m.durationSec)}</small>
            ) : (
              <span className={`status ${m.status}`}>{m.status === 'failed' ? 'Failed' : 'Processing'}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
