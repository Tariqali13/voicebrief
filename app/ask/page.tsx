import { AskPanel } from '@/components/AskPanel';

export const metadata = { title: 'Ask' };

export default function AskPage() {
  return (
    <section style={{ display: 'grid', gap: 18, maxWidth: 820 }}>
      <h1 style={{ fontSize: '2rem' }}>Ask your meetings</h1>
      <p className="lede">
        Answers come only from what was said in your meetings, with a citation for every claim. If it wasn&apos;t said, VoiceBrief says so.
      </p>
      <AskPanel suggestions={['What did we decide about the Google Places quota?', 'Who owes the client a quote, and by when?', 'Why did search go down?']} />
    </section>
  );
}
