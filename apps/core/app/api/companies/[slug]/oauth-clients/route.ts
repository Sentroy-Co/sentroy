// Route handler'ları paylaşılan module'den re-export — core ve auth2
// aynı OAuth Client CRUD'unu paylaşıyor. Implementasyon:
// packages/console/src/handlers/oauth-clients.ts
export {
  listGet as GET,
  createPost as POST,
} from "@workspace/console/handlers/oauth-clients"
