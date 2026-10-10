import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="empty">
      <h1 style={{ fontSize: '2rem' }}>Not on this pad</h1>
      <p className="lede">That meeting doesn&apos;t exist, or it belongs to a different browser.</p>
      <Link href="/" className="btn">
        Back to your meetings
      </Link>
    </section>
  );
}
