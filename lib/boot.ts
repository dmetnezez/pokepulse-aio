import { ensureDemoAccount } from './auth';

export async function ensureDemoAccountSafe() {
  try {
    await ensureDemoAccount();
  } catch (err) {
    console.error('[boot] could not create demo account:', err);
  }
}
