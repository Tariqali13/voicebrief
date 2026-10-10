'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav() {
  const path = usePathname();
  const current = (href: string) => (href === '/' ? path === '/' || path.startsWith('/m/') : path.startsWith(href)) ? 'page' : undefined;
  return (
    <header className="top">
      <Link href="/" className="brand">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="5" y="3" width="22" height="26" rx="3" fill="#F7FAF3" stroke="#1D2A22" strokeWidth="2" />
          <path d="M11 3v26" stroke="#C2453D" strokeWidth="2" />
          <path d="M15 12h8M15 17h6M15 22h7" stroke="#1D2A22" strokeWidth="2" strokeLinecap="round" />
        </svg>
        VoiceBrief
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href="/" aria-current={current('/')}>
          Meetings
        </Link>
        <Link href="/ask" aria-current={current('/ask')}>
          Ask
        </Link>
        <Link href="/record" className="btn primary" aria-current={current('/record')}>
          Record
        </Link>
      </nav>
    </header>
  );
}
