type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** Nama field yang tidak boleh pernah masuk log, di level mana pun. */
const REDACTED_KEYS = /pass(word)?|secret|token|cookie|authorization|access_code|pepper|hash|api_key/i;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, REDACTED_KEYS.test(key) ? '[REDACTED]' : value]),
  );
}

/** Logger JSON-lines terstruktur dengan redaksi kunci sensitif. */
export function createLogger({ silent = false }: { silent?: boolean } = {}): Logger {
  const write = (level: Level, message: string, fields: Record<string, unknown> = {}) => {
    if (silent) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...redact(fields) });
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
