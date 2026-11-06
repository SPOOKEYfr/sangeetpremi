/** Entrypoint: load config, build app, listen. Phase B: local development only — nothing is deployed. */
import { buildApp } from './app.js';

const app = buildApp();
app.server.listen(app.config.port, app.config.host, () => {
  app.logger.info('sangeetpremi-backend listening', {
    host: app.config.host,
    port: app.config.port,
    env: app.config.nodeEnv,
    phase: 'B',
    note: 'No external providers wired; no secrets loaded.',
  });
});

process.on('SIGTERM', () => app.server.close(() => process.exit(0)));
process.on('SIGINT', () => app.server.close(() => process.exit(0)));
