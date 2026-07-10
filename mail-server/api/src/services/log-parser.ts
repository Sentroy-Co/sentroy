import fs from 'fs';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { mailsSentTotal, mailBouncesTotal, mailErrorsTotal } from './metrics';

/**
 * Postfix mail.log satırını parse eder.
 * Örnek satırlar:
 *   postfix/smtp[123]: ABC123: to=<user@example.com>, relay=..., status=sent (250 OK)
 *   postfix/smtp[123]: ABC123: to=<user@example.com>, relay=..., status=bounced (...)
 *   postfix/bounce[123]: ABC123: sender non-delivery notification: DEF456
 */

interface ParsedLogEntry {
  timestamp: string;
  process: string;
  queueId: string;
  to: string | null;
  status: string | null;
  message: string;
}

const LOG_LINE_REGEX =
  /^(\w+\s+\d+\s+[\d:]+)\s+\S+\s+postfix\/(\w+)\[(\d+)\]:\s+(\w+):\s+(.+)$/;

const STATUS_REGEX = /status=(\w+)/;
const TO_REGEX = /to=<([^>]+)>/;

export function parseLogLine(line: string): ParsedLogEntry | null {
  const match = line.match(LOG_LINE_REGEX);
  if (!match) return null;

  const [, timestamp, process, , queueId, message] = match;

  const statusMatch = message.match(STATUS_REGEX);
  const toMatch = message.match(TO_REGEX);

  return {
    timestamp,
    process,
    queueId,
    to: toMatch?.[1] || null,
    status: statusMatch?.[1] || null,
    message,
  };
}

/**
 * Postfix log dosyasını tail -f gibi izler ve event'leri işler.
 * Mail delivery durumlarını metriklere ve DB'ye yansıtır.
 */
export function startLogWatcher(
  prisma: PrismaClient,
  logPath = '/var/log/mail.log'
): fs.FSWatcher | null {
  // Log dosyası yoksa (dev ortamı) izleme
  if (!fs.existsSync(logPath)) {
    console.log(`[log-parser] ${logPath} not found, skipping log watcher`);
    return null;
  }

  let lastSize = 0;

  try {
    const stat = fs.statSync(logPath);
    lastSize = stat.size;
  } catch {
    return null;
  }

  const watcher = fs.watch(logPath, async () => {
    try {
      const stat = fs.statSync(logPath);
      if (stat.size <= lastSize) {
        lastSize = stat.size;
        return;
      }

      const stream = fs.createReadStream(logPath, {
        start: lastSize,
        encoding: 'utf-8',
      });

      const rl = readline.createInterface({ input: stream });

      for await (const line of rl) {
        const entry = parseLogLine(line);
        if (!entry || !entry.status) continue;

        // Metrik güncelle
        if (entry.status === 'sent') {
          mailsSentTotal.inc({ status: 'sent', domain: 'unknown' });
        } else if (entry.status === 'bounced') {
          mailBouncesTotal.inc({ domain: 'unknown' });

          // DB'de bounce olarak işaretle (messageId ile eşleşme)
          if (entry.to) {
            await prisma.mailLog.updateMany({
              where: {
                to: entry.to,
                status: { in: ['sent', 'processing'] },
                bouncedAt: null,
              },
              data: {
                status: 'bounced',
                bouncedAt: new Date(),
                error: `Postfix bounce: ${entry.message.substring(0, 500)}`,
              },
            });
          }
        } else if (entry.status === 'deferred' || entry.status === 'rejected') {
          mailErrorsTotal.inc({ domain: 'unknown', error_type: entry.status });
        }
      }

      lastSize = stat.size;
    } catch (err) {
      console.error('[log-parser] Error processing log:', err);
    }
  });

  console.log(`[log-parser] Watching ${logPath}`);
  return watcher;
}
