import { startServer } from '../server/index.js';

export async function run({ flags }) {
  startServer({ port: flags.port ? Number(flags.port) : undefined });
  await new Promise(() => {});
}
