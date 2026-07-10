import { ObjectId } from "mongodb"

export function toId(doc: any): any {
  if (!doc) return null
  const { _id, ...rest } = doc
  return { id: _id.toString(), ...rest }
}

export function toObjectId(id: string) {
  return new ObjectId(id)
}
