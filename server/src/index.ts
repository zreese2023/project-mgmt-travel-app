import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';

const config = loadConfig();
const app = await buildApp({
  databaseUrl: config.databaseUrl,
  jwtSecret: config.jwtSecret,
  cookieSecure: config.cookieSecure,
  logger: true,
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
