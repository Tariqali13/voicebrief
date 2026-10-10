'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage } from '@/lib/client/stream';

export function SampleButton({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/samples', { method: 'POST' });
    setBusy(false);
    if (!res.ok) return setError(await errorMessage(res));
    router.refresh();
  }

  return (
    <span style={{ display: 'inline-grid', gap: 6 }}>
      <button className={`btn${quiet ? ' quiet' : ''}`} onClick={add} disabled={busy}>
        {busy ? 'Writing notes for three meetings…' : 'Add three sample meetings'}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
