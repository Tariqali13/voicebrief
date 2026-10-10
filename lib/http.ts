/** Newline-delimited JSON streaming: simple to produce, simple to read with fetch(). */
export function ndjson<T>(producer: (send: (event: T) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: T) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      try {
        await producer(send);
      } catch (err) {
        console.error('stream failed', err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}

export const problem = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error: { message, ...extra } }, { status });
