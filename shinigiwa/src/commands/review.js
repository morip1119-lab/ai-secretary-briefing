import { startServer } from '../server/index.js';

export async function run({ flags }) {
  const server = await startServer({
    port: flags.port ? Number(flags.port) : undefined,
    open: flags.noOpen !== true,
    // ポートを明示されたときは、勝手に別の番号へずらさない
    tryOtherPorts: flags.port ? 0 : undefined,
  });
  if (server) await new Promise(() => {});
}
