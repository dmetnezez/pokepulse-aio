import { signIn } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { credentialsSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const { email, password } = credentialsSchema.parse(await readJson(req));
  return { user: await signIn(email, password) };
});
