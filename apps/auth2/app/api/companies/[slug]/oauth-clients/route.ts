export const dynamic = "force-dynamic"

// auth2 OAuth Client management API — core ile shared handler module.
// Implementasyon: packages/console/src/handlers/oauth-clients.ts
export {
  listGet as GET,
  createPost as POST,
} from "@workspace/console/handlers/oauth-clients"
