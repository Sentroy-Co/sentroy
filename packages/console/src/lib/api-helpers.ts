import { auth } from "@workspace/auth/server/auth"
import { NextRequest, NextResponse } from "next/server"

export async function getAuthSession(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })
  if (!session) {
    return null
  }
  return session
}

export function jsonError(message: string, status: number = 400) {
  return NextResponse.json({ data: null, error: message }, { status })
}

export function jsonSuccess(data: unknown, status: number = 200) {
  return NextResponse.json({ data }, { status })
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}
