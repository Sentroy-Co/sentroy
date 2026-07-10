#!/usr/bin/env node
/**
 * Auth0 user export → Sentroy CSV migration.
 *
 * Auth0 management API user export (NDJSON): tek user/line.
 * Indirme: Auth0 Dashboard → Extensions → Auth0 Authorization Extension →
 * Users → Bulk export.
 *
 * Usage:
 *   node from-auth0.mjs auth0-users.ndjson > output/sentroy-users.csv
 */

import { readFileSync } from "node:fs"

const inputPath = process.argv[2]
if (!inputPath) {
  console.error("Usage: from-auth0.mjs <auth0-export.ndjson>")
  process.exit(1)
}

const lines = readFileSync(inputPath, "utf8").split("\n").filter(Boolean)
console.log("email,password,displayName")
let count = 0
for (const line of lines) {
  try {
    const u = JSON.parse(line)
    const email = (u.email ?? "").trim()
    if (!email) continue
    const displayName = (u.name ?? u.nickname ?? "").replace(/,/g, " ")
    console.log(`${email},,${displayName}`)
    count++
  } catch {
    // skip malformed line
  }
}
console.error(`Migrated ${count} users.`)
