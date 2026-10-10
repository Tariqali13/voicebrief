import { notFound } from 'next/navigation';
import { currentOwner } from '@/lib/owner';
import { getMeeting } from '@/lib/meetings';
import { MeetingView } from '@/components/MeetingView';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/m/[id]'>) {
  const owner = await currentOwner();
  const { id } = await props.params;
  const m = owner ? await getMeeting(owner, id) : null;
  return { title: m?.title ?? 'Meeting' };
}

export default async function MeetingPage(props: PageProps<'/m/[id]'>) {
  const owner = await currentOwner();
  const { id } = await props.params;
  const meeting = owner ? await getMeeting(owner, id) : null;
  if (!meeting) notFound();
  const sp = await props.searchParams;
  const t = Number(Array.isArray(sp.t) ? sp.t[0] : sp.t);
  return <MeetingView meeting={meeting} initialTime={Number.isFinite(t) ? t : null} />;
}
