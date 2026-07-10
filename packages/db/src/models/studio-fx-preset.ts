import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "studio_fx_presets"

/**
 * Sentroy Studio — kaydedilmiş FX preset'i. Kullanıcı bir efektin
 * parametrelerini fine-tune ettikten sonra "Save preset" ile bu
 * koleksiyona yazar; sonraki projelerde / track'lerde tek tıkla
 * yüklenir.
 *
 * Scope per-company per-user. Ortak şirket presetleri (`isShared`)
 * tüm üyeler tarafından görülür ama sadece sahibi düzenler/siler.
 */
export type StudioFxEffectType =
  | "echo"
  | "reverb"
  | "phaser"
  | "bitcrusher"
  | "filterSweep"
  | "eq3"
  | "compressor"
  | "distortion"
  | "chorus"
  | "tremolo"
  | "autoWah"
  | "stereoWidener"
  | "multibandCompressor"
  | "limiter"
  | "pitchShift"
  | "djFilter"
  | "autoPanner"
  | "frequencyShifter"
  | "vibrato"
  | "highpassFilter"
  | "lowpassFilter"
  | "bandpassFilter"
  | "feedbackDelay"
  | "pumpingComp"
  | "hallReverb"
  | "stutterGate"
  | "autoTune"
  | "shimmerReverb"
  | "harmonizer"
  | "sidechainComp"

export interface StudioFxPreset {
  id: string
  companyId: string
  /** Preset'i oluşturan user — silme/edit yetkisi sahibinde. */
  userId: string
  /** Kullanıcı tarafından girilen ad ("Vocal warmth", "Drum punch"). */
  name: string
  /** Hangi FX türü için preset — UI bunu filter'la. */
  effectType: StudioFxEffectType
  /** Wet (dry/wet) mix — 0..1. */
  wet: number
  /** FX-specific parametreler. Schema tip-başına farklı:
   *   eq3: { lowFreq, midFreq, highFreq, low, mid, high } (Hz + dB)
   *   compressor: { threshold, ratio, attack, release, knee }
   *   echo: { delayTime, feedback }
   *   reverb: { roomSize, dampening }
   *   ...
   *  Validation handler katmanında. */
  params: Record<string, unknown>
  /** Şirket içinde diğer üyeler görsün mü. Default false (private). */
  isShared: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompanyAndUser(
  companyId: string,
  userId: string,
  filter?: { effectType?: StudioFxEffectType },
): Promise<StudioFxPreset[]> {
  const c = await col()
  // Kullanıcının kendi presetleri + şirket içi paylaşılmışlar
  const query: Record<string, unknown> = {
    companyId,
    $or: [{ userId }, { isShared: true }],
  }
  if (filter?.effectType) query.effectType = filter.effectType
  const docs = await c
    .find(query)
    .sort({ updatedAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function findById(id: string): Promise<StudioFxPreset | null> {
  const c = await col()
  const oid = toObjectId(id)
  if (!oid) return null
  const doc = await c.findOne({ _id: oid })
  return doc ? toId(doc) : null
}

export async function create(input: {
  companyId: string
  userId: string
  name: string
  effectType: StudioFxEffectType
  wet: number
  params: Record<string, unknown>
  isShared?: boolean
}): Promise<StudioFxPreset> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: input.companyId,
    userId: input.userId,
    name: input.name,
    effectType: input.effectType,
    wet: input.wet,
    params: input.params,
    isShared: input.isShared ?? false,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { ...doc, id: result.insertedId.toString() }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<StudioFxPreset, "name" | "wet" | "params" | "isShared">
  >,
): Promise<StudioFxPreset | null> {
  const c = await col()
  const oid = toObjectId(id)
  if (!oid) return null
  const now = new Date()
  await c.updateOne(
    { _id: oid },
    { $set: { ...patch, updatedAt: now } },
  )
  const doc = await c.findOne({ _id: oid })
  return doc ? toId(doc) : null
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const oid = toObjectId(id)
  if (!oid) return false
  const result = await c.deleteOne({ _id: oid })
  return result.deletedCount > 0
}

export async function ensureIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, userId: 1, effectType: 1 })
  await c.createIndex({ companyId: 1, isShared: 1, effectType: 1 })
  await c.createIndex({ updatedAt: -1 })
}
