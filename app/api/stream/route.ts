import { getSessionUser } from '@/lib/auth';
import { getStore } from '@/lib/store';
import type { LiveEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-sent events: restock activity (catalogue-wide) plus the signed-in user's own task updates,
 * notifications and log lines.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const store = getStore();
  const realOnly = Boolean((await store.getSettings(user.id)).real_only);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: LiveEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = store.subscribe((e) => {
        if (realOnly && e.type === 'activity' && e.event.data_source === 'simulated') return;
        if (e.type === 'task' && e.task.user_id !== user.id) return;
        if (e.type === 'notification' && e.notification.user_id !== user.id) return;
        if (e.type === 'log' && e.log.user_id !== user.id) return;
        send(e);
      });
      const heartbeat = setInterval(() => send({ type: 'heartbeat', at: new Date().toISOString() }), 20_000);
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      send({ type: 'heartbeat', at: new Date().toISOString() });
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
