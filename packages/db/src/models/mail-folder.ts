import { getDb } from "../client"

const COLLECTION = "mail_folders"

/**
 * Server-side mirror of custom IMAP folders the user creates from the
 * dashboard. The mail-server's `LIST` cache occasionally fails to
 * surface a freshly-created folder for minutes (Dovecot namespace sync
 * lag, Cyrus metadata DB updates), and the dashboard's localStorage
 * mirror only helps the device that did the creating. Persisting here
 * means a user signing in on a fresh browser still sees their folders,
 * and any mail moved into them stays findable.
 *
 * Scope: `(companyId, mailbox, path)` unique. Mailbox is lower-cased so
 * `Admin@…` and `admin@…` map to the same record.
 *
 * Cleanup: when the canonical IMAP `LIST` returns a path again, the
 * dashboard's merger leaves the DB entry alone — extra rows are
 * harmless. When the user explicitly deletes a folder, the DELETE
 * route removes both the IMAP entry and the row here.
 */
export interface MailFolderDoc {
  id: string
  companyId: string
  mailbox: string
  path: string
  /** When the user created the folder — useful for sorting if mail-server
   *  ever returns conflicting orderings. */
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function add(opts: {
  companyId: string
  mailbox: string
  path: string
}): Promise<void> {
  const c = await col()
  const mailbox = opts.mailbox.toLowerCase()
  await c.updateOne(
    { companyId: opts.companyId, mailbox, path: opts.path },
    {
      $setOnInsert: {
        companyId: opts.companyId,
        mailbox,
        path: opts.path,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  )
}

export async function remove(opts: {
  companyId: string
  mailbox: string
  path: string
}): Promise<void> {
  const c = await col()
  await c.deleteOne({
    companyId: opts.companyId,
    mailbox: opts.mailbox.toLowerCase(),
    path: opts.path,
  })
}

/** Replace `oldPath` with `newPath` after a rename. */
export async function rename(opts: {
  companyId: string
  mailbox: string
  oldPath: string
  newPath: string
}): Promise<void> {
  const c = await col()
  const mailbox = opts.mailbox.toLowerCase()
  await c.updateOne(
    { companyId: opts.companyId, mailbox, path: opts.oldPath },
    { $set: { path: opts.newPath } },
  )
}

export async function listForMailbox(opts: {
  companyId: string
  mailbox: string
}): Promise<string[]> {
  const c = await col()
  const docs = await c
    .find({
      companyId: opts.companyId,
      mailbox: opts.mailbox.toLowerCase(),
    })
    .project({ path: 1, _id: 0 })
    .toArray()
  return docs.map((d) => d.path as string)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { companyId: 1, mailbox: 1, path: 1 },
    { unique: true },
  )
  await c.createIndex({ companyId: 1, mailbox: 1 })
}
