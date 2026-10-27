import { HOP, WINDOW } from './pitch-constants'
import { detect } from './pitch-detect'

// AudioWorkletGlobalScope is not in the DOM lib
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

class PitchDetectorProcessor extends AudioWorkletProcessor {
  private ring = new Float32Array(WINDOW)
  private filled = 0 // samples written since the last emitted window
  private pos = 0

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0]
    if (!ch) return true
    for (const x of ch) {
      this.ring[this.pos] = x
      this.pos = (this.pos + 1) % WINDOW
      if (++this.filled >= WINDOW && (this.filled - WINDOW) % HOP === 0) this.emit()
    }
    return true
  }

  private emit() {
    const win = new Float32Array(WINDOW)
    win.set(this.ring.subarray(this.pos))
    win.set(this.ring.subarray(0, this.pos), WINDOW - this.pos)
    this.port.postMessage(detect(win, sampleRate))
  }
}

registerProcessor('pitch-detector', PitchDetectorProcessor)
