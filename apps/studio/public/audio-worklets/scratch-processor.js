// Sentroy Studio — AudioWorklet scratch processor.
//
// Sample-by-sample buffer reader with linear interpolation and signed rate
// (negative rate = REVERSE playback — true vinyl scratch backward sound).
//
// Lives at /audio-worklets/scratch-processor.js (Next.js public/).
// Loaded once per page via Tone.getContext().rawContext.audioWorklet.addModule().
//
// Messages from main thread (port.postMessage):
//   { type: "buffer", channels: Float32Array[], sampleRate, startSeconds }
//       — load (or replace) the audio buffer; reset head to startSeconds.
//   { type: "seek", seconds }
//       — set head position without changing rate or active state.
//   { type: "rate", rate }
//       — set playback rate. 1 = nominal, -1 = reverse, 0 = freeze.
//   { type: "active", active, startSeconds? }
//       — toggle scratch output. When activating, optionally seek first.
//   { type: "request-position" }
//       — request current head position. Worklet responds with
//         { type: "position", seconds }.
//
// Messages to main thread:
//   { type: "position", seconds } — response to request-position.
//   { type: "ended" } — head clamped at buffer end while rate>0.

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.channels = null
    this.bufferSampleRate = sampleRate
    this.headSamples = 0
    this.rate = 0
    this.active = false
    this.endedReported = false

    this.port.onmessage = (e) => {
      const m = e.data
      if (!m || typeof m.type !== "string") return
      switch (m.type) {
        case "buffer": {
          this.channels = Array.isArray(m.channels) ? m.channels : null
          this.bufferSampleRate = m.sampleRate || sampleRate
          this.headSamples = (m.startSeconds || 0) * this.bufferSampleRate
          this.endedReported = false
          break
        }
        case "seek": {
          this.headSamples = (m.seconds || 0) * this.bufferSampleRate
          this.endedReported = false
          break
        }
        case "rate": {
          this.rate = typeof m.rate === "number" ? m.rate : 0
          this.endedReported = false
          break
        }
        case "active": {
          this.active = !!m.active
          if (this.active && typeof m.startSeconds === "number") {
            this.headSamples = m.startSeconds * this.bufferSampleRate
            this.endedReported = false
          }
          break
        }
        case "request-position": {
          this.port.postMessage({
            type: "position",
            seconds: this.headSamples / this.bufferSampleRate,
          })
          break
        }
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const frames = out[0].length

    if (!this.active || !this.channels || this.channels.length === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0)
      return true
    }

    const ch0 = this.channels[0]
    const ch1 = this.channels.length > 1 ? this.channels[1] : ch0
    const bufLen = ch0.length
    // Buffer's sampleRate may differ from output AudioContext sampleRate.
    // Each output frame consumes `rate * (bufferSR / outputSR)` buffer samples.
    const advancePerFrame = this.rate * (this.bufferSampleRate / sampleRate)

    let head = this.headSamples
    const maxIdx = bufLen - 2

    for (let f = 0; f < frames; f++) {
      if (head < 0 || head > maxIdx) {
        out[0][f] = 0
        if (out.length > 1) out[1][f] = 0
      } else {
        const idx = head | 0
        const frac = head - idx
        const a0 = ch0[idx]
        const a1 = ch0[idx + 1]
        out[0][f] = a0 + (a1 - a0) * frac
        if (out.length > 1) {
          const b0 = ch1[idx]
          const b1 = ch1[idx + 1]
          out[1][f] = b0 + (b1 - b0) * frac
        }
      }
      head += advancePerFrame
    }

    // Clamp + ended detection
    if (head < 0) {
      head = 0
    } else if (head > maxIdx) {
      head = maxIdx
      if (this.rate > 0 && !this.endedReported) {
        this.endedReported = true
        this.port.postMessage({ type: "ended" })
      }
    }
    this.headSamples = head

    return true
  }
}

registerProcessor("scratch-processor", ScratchProcessor)
