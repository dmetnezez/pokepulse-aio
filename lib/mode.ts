import { getStore } from './store';

/** Is this user in "real data only" mode? */
export async function isRealOnly(userId: string): Promise<boolean> {
  return Boolean((await getStore().getSettings(userId)).real_only);
}
