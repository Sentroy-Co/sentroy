import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cdnRoutes from './routes/cdn'
import fileRoutes from './routes/file'
import { corsMiddleware } from './lib/cors'
import { getBaseUrl } from './lib/urls'
import { startSystemStatusWatchdog } from './lib/system-status-watchdog'

const app = express()
const PORT = parseInt(process.env.PORT || '4100')

/**
 * Process-level safety net. Without these listeners a stray EPIPE on
 * a child-process pipe (ffmpeg/pdftoppm dying mid-write) or any
 * other unhandled async error tears the whole server down — Coolify
 * sees the exit and restarts, but every in-flight upload aborts with
 * it. Logging instead of exiting keeps the service alive across
 * those transients; the per-handler try/catch still reports the
 * failure to the caller via HTTP.
 */
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason)
})

app.use(corsMiddleware)
app.use(express.json())

/**
 * Admin CRUD on media records lives under `/cdn/*` and requires the
 * shared secret. Public reads live under `/f/*` — they're unauthenticated
 * and deliberately easy to link to from a browser (`<img src>`, etc).
 */
app.use('/cdn', cdnRoutes)
app.use('/f', fileRoutes)

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    baseUrl: getBaseUrl(),
  })
})

async function start() {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('MONGODB_URI is required')
    process.exit(1)
  }

  // DB adı URI'den ayrılmış — consuming app'lerle (core/mail/storage)
  // aynı pattern: connection string credential-rotatable, DB adı
  // env'den. URI'de path varsa Mongoose default'ı korunur, yoksa
  // explicit MONGODB_DATABASE'e düşer; ikisi de yoksa Mongoose `test`
  // DB'sine bağlanır ve hiçbir doc yazma çalışmaz — fail-fast yapalım.
  const dbName = process.env.MONGODB_DATABASE?.trim()
  if (!dbName) {
    console.warn(
      '[cdn] MONGODB_DATABASE not set — Mongoose will use the database segment from MONGODB_URI (or `test` if absent). Consuming apps explicitly read MONGODB_DATABASE; mismatch here means cdn-server writes to a different DB and uploads do not show up in storage UI.',
    )
  }

  if (!process.env.BASE_URL) {
    console.warn('[cdn] BASE_URL not set — generated URLs will point at localhost')
  }

  try {
    await mongoose.connect(mongoUri, dbName ? { dbName } : undefined)
    console.log(
      `MongoDB connected → db=${mongoose.connection.name} host=${mongoose.connection.host}`,
    )
  } catch (error) {
    console.error('MongoDB connection failed:', error)
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`CDN-API running on port ${PORT} — public base: ${getBaseUrl()}`)
    startSystemStatusWatchdog()
  })
}

start()
