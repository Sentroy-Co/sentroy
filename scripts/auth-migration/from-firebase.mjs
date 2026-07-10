#!/usr/bin/env node
/**
 * Firebase Auth export → Sentroy CSV migration.
 *
 * Firebase Admin CLI:
 *   firebase auth:export users.json --format=JSON --project=<id>
 *
 * Sonra:
 *   node from-firebase.mjs users.json > output/sentroy-users.csv
 *
 * Çıktı: email + boş password + displayName CSV. User'lar Sentroy'da
 * verified olarak yaratılır; password set için password-reset akışı
 * çağrılır (hash uyumsuzluğu — Firebase bcrypt/scrypt vs Sentroy argon2id).
 */

import { readFileSync } from "node:fs"

const inputPath = process.argv[2]
if (!inputPath) {
  console.error("Usage: from-firebase.mjs <firebase-export.json>")
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"))
const users = raw.users ?? raw // Firebase export: { users: [...] } veya doğrudan array

console.log("email,password,displayName")
for (const u of users) {
  const email = (u.email ?? "").trim()
  if (!email) continue
  const displayName = (u.displayName ?? "").replace(/,/g, " ")
  // password boş → Sentroy random üretir; user password-reset ile belirler
  console.log(`${email},,${displayName}`)
}
console.error(`Migrated ${users.length} users.`)
