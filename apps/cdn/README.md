# edrive-cdn

Standalone media service. Express + Sharp in front of an S3-compatible
bucket (built for IDrive e2), with its own MongoDB for record keeping and
pretty public URLs for serving.

Consuming apps talk to three endpoint groups:

- **`POST/GET/DELETE /cdn/*`** — admin actions. Guarded by a shared secret.
- **`GET /f/:mediaId[/:quality]`** — public file reads. No auth; addresses
  are the ObjectId, so they're unguessable.
- **`GET /health`** — liveness / connection status.

---

## How it works

```
┌──────────────┐  multipart+x-cdn-secret    ┌──────────────┐
│  consumer    ├──────────────────────────► │  edrive-cdn  │
│  (Next app)  │                            │              │
└──────┬───────┘                            │  ┌────────┐  │
       │                                    │  │ Sharp  │  │
       │    fetch <BASE_URL>/f/:id/:q       │  ├────────┤  │
       │◄───────────────────────────────────┤  │  S3    │  │
       │                                    │  ├────────┤  │
       │                                    │  │ Mongo  │  │
       └────────────────────────────────────►  └────────┘  │
                                            └──────────────┘
```

### Upload path

1. Consumer posts `multipart/form-data` to `POST /cdn/upload` with the
   shared `x-cdn-secret` header.
2. Sharp decodes the file. Images get rotated by EXIF, compressed
   (JPEG/PNG/WebP), and a thumbnail **ladder** is generated at every
   published width smaller than the source (`125, 250, 500, 1000, 2000`).
   HEIC/HEIF uploads are transparently decoded to PNG first — iOS Safari
   often tags them as `application/octet-stream`, so the service also
   magic-byte-sniffs the buffer.
3. Original + each thumbnail are pushed to S3 under
   `users/{uploadedBy}/{folderType}/{timestamp}-{filename}`.
4. A Mongo record is created; its `_id` is the `mediaId` the caller uses
   forever after. The response serialises full `<BASE_URL>/f/:id/:q` URLs —
   callers never see S3 keys.

### Read path

Browsers fetch files directly from the CDN at
`<BASE_URL>/f/:mediaId[/:quality]`:

- `quality = "original"` (or omitted) → the main file.
- `quality = <number>` (`125`, `250`, `500`, `1000`, `2000`) → the matching
  thumbnail if it was generated. **Silent fallback** to the original if
  the requested width is larger than the source — `<img src=".../1000">`
  always works, even when the image is natively 700px.

Responses include `ETag` + `Cache-Control: public, max-age=31536000, immutable`,
so CDNs and browsers cache aggressively; `If-None-Match` gets a plain 304.

### Delete path

`DELETE /cdn/file` with `{ mediaId }`. The service looks up the record,
removes every S3 key that belongs to it (original + every thumbnail), and
then drops the Mongo doc. Partial S3 failures are reported in the response
but the record is still deleted — orphaned storage objects are cheaper to
reap later than stale rows that keep surfacing in the library UI.

Admins bypass ownership checks via `x-user-admin: true`; otherwise only
the original `uploadedBy` user may delete.

### List path

`GET /cdn/list` returns a paginated, filterable view of the Mongo
collection. The consuming app is expected to always pin `folder` to its
own project key so one CDN can serve many apps without their libraries
leaking into each other.

---

## Stack

- **Runtime**: Node.js 20+ (Bun-friendly)
- **Framework**: Express 5
- **Image processing**: sharp (+ `heic-convert` for HEIF decode)
- **Storage**: IDrive e2 / any S3-compatible provider via AWS SDK v3
- **Database**: MongoDB via Mongoose (**dedicated** — don't share with the
  consuming app)

## Setup

```bash
bun install
cp .env.example .env
# fill in values
bun run dev
```

## Environment Variables

| Variable            | Description                                                   | Example                                 |
| ------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `PORT`              | HTTP port                                                     | `4100`                                  |
| `BASE_URL`          | Public origin — every emitted URL is built from this          | `https://cdn.example.com`               |
| `MONGODB_URI`       | Dedicated CDN Mongo (not the consuming app's DB)              | `mongodb://localhost:27017/cdn`         |
| `IDRIVE_ENDPOINT`   | S3-compatible endpoint                                        | `https://xxxxxx.e2.idrivee2.com`        |
| `IDRIVE_ACCESS_KEY` | S3 access key                                                 |                                         |
| `IDRIVE_SECRET_KEY` | S3 secret key                                                 |                                         |
| `IDRIVE_BUCKET`     | Bucket name                                                   |                                         |
| `IDRIVE_REGION`     | Bucket region                                                 | `eu-central-2`                          |
| `CDN_API_SECRET`    | Shared secret required on every `/cdn/*` request              |                                         |
| `CDN_CORS_ORIGINS`  | Extra comma-separated browser origins allowed for credentialed `/cdn/*` requests. `*.sentroy.com` and localhost are allowed by default; `/f/*` public file reads reflect any origin. | `https://studio.sentroy.com` |
| `CORE_APP_URL`      | Core app origin for the optional system-status watchdog        | `https://sentroy.com`                   |
| `INTERNAL_API_SECRET` | Shared secret sent to Core as `x-internal-secret`           |                                         |
| `SYSTEM_STATUS_WATCHDOG_INTERVAL_MS` | Watchdog interval; defaults to 30 minutes    | `1800000`                               |
| `SYSTEM_STATUS_WATCHDOG_INITIAL_DELAY_MS` | Delay before first watchdog probe       | `5000`                                  |
| `SYSTEM_STATUS_WATCHDOG_TIMEOUT_MS` | Timeout for each watchdog request              | `10000`                                 |

If `BASE_URL` is missing the service falls back to `http://localhost:4100`
and logs a warning; every emitted URL would then point at localhost, so
don't ship without it.

When `CORE_APP_URL` or `SYSTEM_STATUS_WATCHDOG_URL` and
`INTERNAL_API_SECRET` are configured, the CDN process calls Core's
`/api/admin/system-status` endpoint after boot and then on the configured
interval. That keeps system-status probes recorded even when the admin page is
closed. Set `SYSTEM_STATUS_WATCHDOG_ENABLED=false` to disable it explicitly.

---

## API

All `/cdn/*` endpoints require:

| Header           | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `x-cdn-secret`   | Must match `CDN_API_SECRET`                      |
| `x-user-id`      | External user id — stored as `uploadedBy`        |
| `x-user-email`   | Optional; not persisted, used for audit logging  |
| `x-user-admin`   | `true` to bypass ownership checks (delete)       |

### `POST /cdn/upload`

Upload a file. Images are compressed + get a full thumbnail ladder;
everything else is stored as-is.

**Body** (`multipart/form-data`):

| Field         | Required | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `file`        | ✓        | The binary                                             |
| `folderType`  |          | Logical bucket name (default `uploads`). Consuming apps should set this to their project key. |
| `public`      |          | `"true"`/`"false"` — S3 ACL (default `true`)           |
| `alt`         |          | Alt text                                               |
| `caption`     |          | Caption                                                |
| `tags`        |          | Comma-separated tag list                               |

**Response**:

```json
{
  "success": true,
  "media": {
    "mediaId": "68a1b2c3d4e5f6a7b8c9d0e1",
    "url":         "https://cdn.example.com/f/68a1…e1/original",
    "downloadUrl": "https://cdn.example.com/f/68a1…e1/original?download=1&filename=photo.jpg",
    "fileName": "users/69cc…/dynamic-ui/1776819539319-photo.jpg",
    "originalName": "photo.jpg",
    "folder": "dynamic-ui",
    "type": "image",
    "mimeType": "image/jpeg",
    "size": 178392,
    "uploadedBy": "69cc…",
    "isPublic": true,
    "imageMeta": {
      "width": 1440,
      "height": 1800,
      "orientation": "portrait",
      "thumbnails": [
        { "width": 125,  "height": 156,  "size": 2959,  "url": "https://cdn.example.com/f/68a1…e1/125"  },
        { "width": 250,  "height": 313,  "size": 9820,  "url": "https://cdn.example.com/f/68a1…e1/250"  },
        { "width": 500,  "height": 625,  "size": 28276, "url": "https://cdn.example.com/f/68a1…e1/500"  },
        { "width": 1000, "height": 1250, "size": 92100, "url": "https://cdn.example.com/f/68a1…e1/1000" }
      ]
    },
    "createdAt": "2026-04-22T10:20:30.000Z",
    "updatedAt": "2026-04-22T10:20:30.000Z"
  }
}
```

### `GET /cdn/list`

Paginated listing. All params are optional.

| Query        | Type   | Default | Notes                                     |
| ------------ | ------ | ------- | ----------------------------------------- |
| `folder`     | string | —       | Restrict to a project bucket              |
| `uploadedBy` | string | —       | Restrict to a single uploader             |
| `type`       | enum   | —       | `image`/`video`/`audio`/`document`/`other` |
| `search`     | string | —       | Case-insensitive match on `originalName`  |
| `limit`      | int    | `30`    | Clamped to 1–100                          |
| `offset`     | int    | `0`     |                                           |

**Response**:

```json
{
  "success": true,
  "items": [ /* array of serialised media */ ],
  "total": 42,
  "limit": 30,
  "offset": 0
}
```

### `DELETE /cdn/file`

**Body**: `{ "mediaId": "…" }`

Removes the record and every S3 key it references (main + all
thumbnails). Non-admin callers can only delete their own uploads.

**Response**:

```json
{
  "success": true,
  "mediaId": "68a1…e1",
  "deleted": [ "users/…/photo.jpg", "users/…/photo_125.jpg", … ],
  "failed":  []
}
```

### `GET /f/:mediaId[/:quality]` — public

Path:

- `/f/:mediaId` → original
- `/f/:mediaId/original` → explicit original
- `/f/:mediaId/:width` → thumbnail at that width (`125`, `250`, `500`,
  `1000`, `2000`). Falls back to original if the variant doesn't exist.

Query:

| Param      | Value                   | Effect                             |
| ---------- | ----------------------- | ---------------------------------- |
| `download` | `1` / `true`            | `Content-Disposition: attachment`  |
| `filename` | string                  | Overrides the attachment filename  |

### `GET /health`

```json
{
  "status": "ok",
  "uptime": 12345.67,
  "mongo": "connected",
  "baseUrl": "https://cdn.example.com"
}
```

---

## Storage layout

```
users/{uploadedBy}/{folderType}/{timestamp}-{filename}.jpg        ← original
users/{uploadedBy}/{folderType}/{timestamp}-{filename}_125.jpg    ← 125px
users/{uploadedBy}/{folderType}/{timestamp}-{filename}_250.jpg    ← 250px
users/{uploadedBy}/{folderType}/{timestamp}-{filename}_500.jpg    ← 500px
users/{uploadedBy}/{folderType}/{timestamp}-{filename}_1000.jpg   ← 1000px
users/{uploadedBy}/{folderType}/{timestamp}-{filename}_2000.jpg   ← 2000px
```

Clients never need these paths — `/f/:mediaId/:quality` is the public
contract. Internal keys are kept in Mongo so delete cleanup is a single
record lookup.

### Thumbnail ladder

Widths: **125 · 250 · 500 · 1000 · 2000**. A variant is only generated
when the source is wider than the target, so small images don't end up
with wasteful copies. To add a size, edit
`THUMBNAIL_WIDTHS` in `src/services/image.ts` — the route layer picks it
up automatically. Keep the list sorted ascending; every size costs one
decode + one S3 PUT per upload.

---

## Docker

```bash
docker build -t edrive-cdn .
docker run -p 4100:4100 --env-file .env edrive-cdn
```

---

## Integration (Next.js consumer)

The consuming app keeps the CDN secret server-side and proxies
admin-facing calls; browsers fetch files directly from `BASE_URL`.

```env
# Consuming app (e.g. dynamic-ui)
EDRIVE_CDN_URL=https://cdn.example.com    # same as the CDN's BASE_URL
CDN_API_SECRET=<shared-secret>
EDRIVE_CDN_FOLDER=my-project               # sent as folderType on uploads
```

Typical proxy layout on the Next side:

| Next route                  | Method | Forwards to            |
| --------------------------- | ------ | ---------------------- |
| `/api/cdn` (auth + scope)   | POST   | `/cdn/upload`          |
| `/api/cdn`                  | GET    | `/cdn/list`            |
| `/api/cdn`                  | DELETE | `/cdn/file`            |
| `<BASE_URL>/f/:id/:quality` | GET    | served directly by CDN |
