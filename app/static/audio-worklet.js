/* Resample microphone input to 16 kHz mono signed little-endian PCM.
 * AudioWorklet keeps capture off the UI thread. Output stays silent. */
class PolicyPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.ratio = sampleRate / 16000; this.position = 0;
    this.pending = []; this.frame = new ArrayBuffer(3200); this.view = new DataView(this.frame); this.used = 0;
  }
  process(inputs) {
    const samples = inputs[0] && inputs[0][0];
    if (!samples) return true;
    this.pending.push(...samples);
    while (this.position + 1 < this.pending.length) {
      const index = Math.floor(this.position), fraction = this.position - index;
      const value = Math.max(-1, Math.min(1, this.pending[index] * (1 - fraction) + this.pending[index + 1] * fraction));
      this.view.setInt16(this.used * 2, Math.round(value < 0 ? value * 32768 : value * 32767), true);
      this.used++; this.position += this.ratio;
      if (this.used === 1600) {
        this.port.postMessage(this.frame, [this.frame]);
        this.frame = new ArrayBuffer(3200); this.view = new DataView(this.frame); this.used = 0;
      }
    }
    const consumed = Math.min(Math.floor(this.position), this.pending.length - 1);
    this.pending.splice(0, consumed); this.position -= consumed;
    return true;
  }
}
registerProcessor('policy-pcm', PolicyPCM);
