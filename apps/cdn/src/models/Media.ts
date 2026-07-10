import mongoose, { Document, Model, Schema } from 'mongoose'

/**
 * Canonical CDN-side media record. This service owns the document — the
 * consuming apps talk to us through `mediaId` and treat our URLs as
 * source of truth. A file's S3 key is a function of the record
 * (`fileName` for the original, `imageMeta.thumbnails[i].fileName` for a
 * variant); clients never need to know those keys directly.
 */

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other'

export interface IThumbnail {
  /** Pixel width of the variant. Doubles as the `quality` URL segment. */
  width: number
  height: number
  /** S3 key (so delete + transforms can be applied without re-derivation). */
  fileName: string
  size: number
}

export interface IImageMeta {
  width: number
  height: number
  orientation: 'landscape' | 'portrait' | 'square'
  thumbnails: IThumbnail[]
}

/**
 * One transcoded variant of a video original. Mirrors the thumbnail
 * shape so consumers can request a specific quality the same way they
 * already do for images (`/f/:mediaId/:height`). `fileName` is the
 * full S3 key, written under the original's prefix as
 * `{base}_{height}p.mp4`, so deleting the source media doc can sweep
 * every variant from the same place.
 */
export interface IVideoVariant {
  /** Target output height in pixels (e.g. 144, 480, 720, 1080). */
  height: number
  /** Resulting width — derived from source aspect, so `-2:HEIGHT` in
   *  ffmpeg keeps it even-numbered (yuv420p constraint). */
  width: number
  /** Full S3 key — same convention as IThumbnail.fileName. */
  fileName: string
  size: number
  /** Effective bitrate in bps. Optional — only set when probed. */
  bitrate?: number
}

export interface IVideoMeta {
  width: number
  height: number
  /** Length in seconds. May be 0 if probe failed. */
  duration: number
  variants: IVideoVariant[]
}

/**
 * Audio probe + tempo analysis written at upload time. Consumers
 * (apps/studio DJ editor) read `bpm` directly off the media doc to
 * render the deck/library without re-decoding the source in the
 * browser. Fields are nullable — analysis may legitimately bail
 * (non-rhythmic content, ffmpeg failure) and the consumer falls back
 * to its in-browser detector when missing.
 */
export interface IAudioMeta {
  /** Length in seconds (from the ffmpeg-decoded PCM length). */
  duration: number
  /** Detected BPM, octave-folded into [70, 180]. null = uncertain. */
  bpm: number | null
  /** Decoded source sample rate analyzed at (currently always 22050 Hz). */
  sampleRate: number
  /** Source channel count (1 = mono, 2 = stereo, etc.). */
  channels: number
}

/**
 * Async transcode progress tracker. Set on every video upload that
 * opted into the ladder so the storage UI can render a "processing"
 * badge (and skip the variant picker until status === completed).
 *
 * `status` lifecycle: `queued` (response sent, before background
 * worker picks it up) → `processing` (at least one rung running) →
 * `completed` (all rungs done) | `failed` (no rungs landed). UI
 * treats anything other than `completed`/undefined as "in flight".
 */
export interface IMediaProcessing {
  status: 'queued' | 'processing' | 'completed' | 'failed'
  variantsTotal?: number
  variantsCompleted?: number
  error?: string
  startedAt?: Date
  completedAt?: Date
}

export interface IMedia extends Document {
  _id: mongoose.Types.ObjectId
  /** Bucket bu medyanın ait olduğu izole depolama alanı. S3 key prefix'i. */
  bucketId: string
  /** Bucket'ın ait olduğu tenant — hızlı filtreleme için denormalize. */
  companyId: string
  /** S3 key'in bucket prefix'inden sonraki kısmı; tam key `{bucketId}/{fileName}`. */
  fileName: string
  originalName: string
  type: MediaType
  size: number
  mimeType: string
  folder: string
  /** Yükleyen kullanıcının auth user id'si (audit için; yetki bucketId üzerinden). */
  uploadedBy: string
  tags: string[]
  alt?: string
  caption?: string
  isPublic: boolean
  imageMeta?: IImageMeta
  videoMeta?: IVideoMeta
  audioMeta?: IAudioMeta
  processing?: IMediaProcessing
  createdAt: Date
  updatedAt: Date
}

export interface IMediaModel extends Model<IMedia> {
  getFileType(mimeType: string): MediaType
}

const thumbnailSchema = new Schema<IThumbnail>(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fileName: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
)

const imageMetaSchema = new Schema<IImageMeta>(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    orientation: {
      type: String,
      enum: ['landscape', 'portrait', 'square'],
      required: true,
    },
    thumbnails: [thumbnailSchema],
  },
  { _id: false }
)

const videoVariantSchema = new Schema<IVideoVariant>(
  {
    height: { type: Number, required: true },
    width: { type: Number, required: true },
    fileName: { type: String, required: true },
    size: { type: Number, required: true },
    bitrate: { type: Number },
  },
  { _id: false }
)

const videoMetaSchema = new Schema<IVideoMeta>(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    duration: { type: Number, required: true },
    variants: [videoVariantSchema],
  },
  { _id: false }
)

const audioMetaSchema = new Schema<IAudioMeta>(
  {
    duration: { type: Number, required: true },
    // bpm null olabilir — silent / non-rhythmic dosyalar için.
    bpm: { type: Number, default: null },
    sampleRate: { type: Number, required: true },
    channels: { type: Number, required: true },
  },
  { _id: false }
)

const processingSchema = new Schema<IMediaProcessing>(
  {
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      required: true,
    },
    variantsTotal: { type: Number },
    variantsCompleted: { type: Number },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false }
)

const mediaSchema = new Schema<IMedia>(
  {
    bucketId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    fileName: { type: String, required: true, trim: true, index: true },
    originalName: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['image', 'video', 'audio', 'document', 'other'],
      default: 'other',
    },
    size: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, trim: true },
    folder: { type: String, default: 'uploads', trim: true, index: true },
    uploadedBy: { type: String, required: true, index: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    alt: { type: String, trim: true },
    caption: { type: String, trim: true },
    isPublic: { type: Boolean, default: true },
    imageMeta: { type: imageMetaSchema, default: undefined },
    videoMeta: { type: videoMetaSchema, default: undefined },
    audioMeta: { type: audioMetaSchema, default: undefined },
    processing: { type: processingSchema, default: undefined },
  },
  { timestamps: true }
)

mediaSchema.index({ bucketId: 1, fileName: 1 }, { unique: true })
mediaSchema.index({ bucketId: 1, createdAt: -1 })
mediaSchema.index({ companyId: 1, createdAt: -1 })
mediaSchema.index({ companyId: 1, type: 1, createdAt: -1 })
mediaSchema.index({ uploadedBy: 1, createdAt: -1 })
mediaSchema.index({ tags: 1 })

mediaSchema.statics.getFileType = function (mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('text')
  )
    return 'document'
  return 'other'
}

const Media =
  (mongoose.models.Media as unknown as IMediaModel) ||
  mongoose.model<IMedia, IMediaModel>('Media', mediaSchema)

export default Media
