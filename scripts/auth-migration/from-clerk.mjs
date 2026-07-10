#!/usr/bin/env node
/**
 * Clerk user export CSV → Sentroy CSV migration (header rename).
 *
 * Clerk Dashboard → Users → Export → CSV. Header'da `email_addresses` /
 * `first_name` + `last_name` gibi kolonlar var. Sentroy CSV format:
 * `email,password,displayName`.
 *
 * Usage:
 *   node from-clerk.mjs clerk-export.csv > output/sentroy-users.csv
 */

import { readFileSync } from "node:fs"

const inputPath = process.argv[2]
if (!inputPath) {
  console.error("Usage: from-clerk.mjs <clerk-export.csv>")
  process.exit(1)
}

const lines = readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean)
if (lines.length === 0) {
  console.error("Empty file.")
  process.exit(1)
}
const header = lines[0].split(",").map((c) => c.trim().toLowerCase())
const idxEmail = header.findIndex((c) => /email/.test(c))
const idxFirst = header.indexOf("first_name")
const idxLast = header.indexOf("last_name")
if (idxEmail < 0) {
  console.error("Could not find email column in Clerk export.")
  process.exit(1)
}

console.log("email,password,displayName")
let count = 0
for (let i = 1; i < lines.length; i++) {
  const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
  const email = cells[idxEmail] ?? ""
  if (!email) continue
  const first = idxFirst >= 0 ? cells[idxFirst] ?? "" : ""
  const last = idxLast >= 0 ? cells[idxLast] ?? "" : ""
  const name = `${first} ${last}`.trim().replace(/,/g, " ")
  console.log(`${email},,${name}`)
  count++
}
console.error(`Migrated ${count} users.`)
