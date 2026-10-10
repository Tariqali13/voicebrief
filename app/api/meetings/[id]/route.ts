import { ownerId } from '@/lib/owner';
import { deleteMeeting, getMeeting } from '@/lib/meetings';
import { problem } from '@/lib/http';

export async function GET(_req: Request, ctx: RouteContext<'/api/meetings/[id]'>) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(await ownerId(), id);
  return meeting ? Response.json(meeting) : problem(404, 'Meeting not found.');
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/meetings/[id]'>) {
  const { id } = await ctx.params;
  return (await deleteMeeting(await ownerId(), id)) ? Response.json({ ok: true }) : problem(404, 'Meeting not found.');
}
