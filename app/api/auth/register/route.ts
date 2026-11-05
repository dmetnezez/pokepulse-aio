import { signUp } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { registerSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const input = registerSchema.parse(await readJson(req));
  return { user: await signUp(input.email, input.password, input.display_name, input.starter_tasks) };
});
