/**
 * Runs once when the Next.js server boots. In embedded mode (default) the monitoring scheduler lives
 * inside the server process; set WORKER_MODE=external and run `npm run worker` to split it out.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNode } = await import('./instrumentation-node');
    await startNode();
  }
}
