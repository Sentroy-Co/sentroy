export const dynamic = "force-dynamic"
// Audio upload boyutu için Next default 4 MB'lık body limit aşılır.
// Route Segment Config'de bodySizeLimit override.
export const maxDuration = 60

export {
  listGet as GET,
  uploadPost as POST,
} from "@workspace/console/handlers/studio-assets"
