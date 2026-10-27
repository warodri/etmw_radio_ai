type LogLevel = 'info' | 'warn' | 'error';

function writeLog(level: LogLevel, event: string, meta: Record<string, unknown>): void {
  const safeMeta = Object.fromEntries(
    Object.entries(meta).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !normalized.includes('token') && !normalized.includes('secret') && !normalized.includes('password');
    }),
  );

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...safeMeta,
    }),
  );
}

export const logger = {
  info(event: string, meta: Record<string, unknown> = {}): void {
    writeLog('info', event, meta);
  },
  warn(event: string, meta: Record<string, unknown> = {}): void {
    writeLog('warn', event, meta);
  },
  error(event: string, meta: Record<string, unknown> = {}): void {
    writeLog('error', event, meta);
  },
};
