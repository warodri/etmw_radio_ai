import http from 'http';
import { createApp } from './app.js';
import { closeDatabase, connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await connectDatabase();

  const server = http.createServer(createApp());

  server.listen(env.PORT, env.HOST, () => {
    logger.info('server.started', {
      host: env.HOST,
      port: env.PORT,
      environment: env.NODE_ENV,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('server.shutdown_requested', { signal });

    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });

    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main().catch((error: unknown) => {
  logger.error('server.start_failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
