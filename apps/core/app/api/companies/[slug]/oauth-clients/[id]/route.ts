export const dynamic = "force-dynamic"

// Route handler'ları paylaşılan module'den re-export — core ve auth2
// aynı OAuth Client CRUD'unu paylaşıyor. Implementasyon:
// packages/console/src/handlers/oauth-clients.ts
export {
  itemGet as GET,
  itemPatch as PATCH,
  itemDelete as DELETE,
} from "@workspace/console/handlers/oauth-clients"
