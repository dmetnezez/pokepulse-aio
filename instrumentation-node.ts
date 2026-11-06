import { ensureDemoAccountSafe } from './lib/boot';
import { getScheduler } from './lib/monitor/scheduler';
import { startEmailWatchers } from './lib/emailwatch/runner';

export async function startNode() {
  await ensureDemoAccountSafe();
  if (process.env.WORKER_MODE === 'external') {
    console.log('[monitor] WORKER_MODE=external — scheduler not started in the web process');
  } else if (process.env.NEXT_PHASE !== 'phase-production-build') {
    getScheduler().start();
    startEmailWatchers();
  }
}
