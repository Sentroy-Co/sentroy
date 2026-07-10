import { getDb } from "../client"
import type { ContactList } from "../types"
import { toId, toObjectId } from "./_helpers"

const LISTS_COLLECTION = "contact_lists"
const MEMBERS_COLLECTION = "contact_list_members"

function listsCol() {
  return getDb().then((db) => db.collection(LISTS_COLLECTION))
}

function membersCol() {
  return getDb().then((db) => db.collection(MEMBERS_COLLECTION))
}

export async function findByCompany(
  companyId: string,
): Promise<ContactList[]> {
  const c = await listsCol()
  const docs = await c.find({ companyId }).toArray()
  return docs.map(toId)
}

export async function findById(id: string): Promise<ContactList | null> {
  const c = await listsCol()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function create(
  data: Omit<ContactList, "id" | "contactCount" | "createdAt" | "updatedAt">,
): Promise<ContactList> {
  const c = await listsCol()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    contactCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    contactCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await listsCol()
  const m = await membersCol()
  await m.deleteMany({ listId: id })
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function addMember(
  listId: string,
  contactId: string,
): Promise<void> {
  const m = await membersCol()
  const c = await listsCol()
  await m.insertOne({
    listId,
    contactId,
    addedAt: new Date(),
  })
  await c.updateOne(
    { _id: toObjectId(listId) },
    {
      $inc: { contactCount: 1 },
      $set: { updatedAt: new Date() },
    },
  )
}

export async function removeMember(
  listId: string,
  contactId: string,
): Promise<void> {
  const m = await membersCol()
  const c = await listsCol()
  const result = await m.deleteOne({ listId, contactId })
  if (result.deletedCount === 1) {
    await c.updateOne(
      { _id: toObjectId(listId) },
      {
        $inc: { contactCount: -1 },
        $set: { updatedAt: new Date() },
      },
    )
  }
}

export async function getMembers(listId: string): Promise<string[]> {
  const m = await membersCol()
  const docs = await m.find({ listId }).toArray()
  return docs.map((doc) => doc.contactId)
}

export async function createIndexes(): Promise<void> {
  const c = await listsCol()
  const m = await membersCol()
  await c.createIndex({ companyId: 1 })
  await m.createIndex({ listId: 1, contactId: 1 }, { unique: true })
}
