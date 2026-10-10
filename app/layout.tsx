import type { Metadata } from 'next';
import '@fontsource-variable/recursive/full.css';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: { default: 'VoiceBrief', template: '%s · VoiceBrief' },
  description: 'Record a meeting, get notes where every decision and action item links to the moment it was said, then ask questions across all your meetings.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="frame">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
