import { startServer } from '../server/index.js';

export async function run({ flags }) {
  await startServer({
    port: flags.port ? Number(flags.port) : undefined,
    open: flags.noOpen !== true,
  });
  await new Promise(() => {});
}
