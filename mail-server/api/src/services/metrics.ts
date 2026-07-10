import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

// Default Node.js metrikleri (CPU, memory, event loop)
collectDefaultMetrics({ register });

// ── Mail Metrikleri ──

export const mailsSentTotal = new Counter({
  name: 'sentroy_mails_sent_total',
  help: 'Total number of mails sent',
  labelNames: ['status', 'domain'] as const,
  registers: [register],
});

export const mailSendDuration = new Histogram({
  name: 'sentroy_mail_send_duration_seconds',
  help: 'Mail send duration in seconds',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const mailQueueDepth = new Gauge({
  name: 'sentroy_mail_queue_depth',
  help: 'Current mail queue depth',
  labelNames: ['state'] as const,
  registers: [register],
});

// ── API Metrikleri ──

export const httpRequestsTotal = new Counter({
  name: 'sentroy_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'sentroy_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ── Domain Metrikleri ──

export const domainsTotal = new Gauge({
  name: 'sentroy_domains_total',
  help: 'Total domains by status',
  labelNames: ['status'] as const,
  registers: [register],
});

// ── Bounce / Error ──

export const mailBouncesTotal = new Counter({
  name: 'sentroy_mail_bounces_total',
  help: 'Total mail bounces',
  labelNames: ['domain'] as const,
  registers: [register],
});

export const mailErrorsTotal = new Counter({
  name: 'sentroy_mail_errors_total',
  help: 'Total mail send errors',
  labelNames: ['domain', 'error_type'] as const,
  registers: [register],
});
