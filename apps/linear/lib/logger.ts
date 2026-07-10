/**
 * Basit console tabanlı JSON logger (triage logger.server.ts portu, pino YOK).
 * Seviye `LOG_LEVEL` env'inden okunur (debug|info|warn|error, varsayılan info).
 */

type Level = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function configuredLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw
  }
  return "info"
}

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel()]
}

function emit(level: Level, fields: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const line = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  }
  const text = JSON.stringify(line)
  if (level === "error") {
    console.error(text)
  } else if (level === "warn") {
    console.warn(text)
  } else {
    console.log(text)
  }
}

export const logger = {
  debug: (fields: Record<string, unknown>) => emit("debug", fields),
  info: (fields: Record<string, unknown>) => emit("info", fields),
  warn: (fields: Record<string, unknown>) => emit("warn", fields),
  error: (fields: Record<string, unknown>) => emit("error", fields),
}
