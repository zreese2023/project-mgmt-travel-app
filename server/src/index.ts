import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { SHUTDOWN_SIGNALS, createShutdown } from './lib/shutdown.js';

const config = loadConfig();
const app = await buildApp({
  databaseUrl: config.databaseUrl,
  jwtSecret: config.jwtSecret,
  cookieSecure: config.cookieSecure,
  logger: true,
});

// Ctrl+C / stop signals close the server and database pool, then exit 0 (not an error).
const shutdown = createShutdown({
  close: () => app.close(),
  exit: (code) => process.exit(code),
  log: (message) => app.log.info(message),
});
for (const signal of SHUTDOWN_SIGNALS) process.on(signal, () => void shutdown(signal));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
