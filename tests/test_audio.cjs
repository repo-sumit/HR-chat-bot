const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
for (const rate of [16000, 44100, 48000]) {
  let Processor;
  const frames = [];
  const sandbox = {
    sampleRate: rate,
    AudioWorkletProcessor: class { constructor() { this.port = {postMessage: data => frames.push(new Uint8Array(data).slice())}; } },
    registerProcessor: (_, processor) => { Processor = processor; },
    ArrayBuffer, DataView, Math
  };
  vm.runInNewContext(fs.readFileSync('app/static/audio-worklet.js', 'utf8'), sandbox);
  const processor = new Processor();
  // Include the next interpolation sample beyond a full second of input.
  const blocks = Math.ceil(rate / 128) + 1;
  for (let i = 0; i < blocks; i++) processor.process([[new Float32Array(128).fill(.5)]]);
  const produced = frames.length * 1600 + processor.used;
  assert.ok(Math.abs(produced - (blocks * 128 - 1) * 16000 / rate) < 1.01);
  assert.equal(frames.length, 10);
  assert.equal(frames[0].length, 3200);
  assert.equal(new DataView(frames[0].buffer).getInt16(0, true), 16384);
  console.log('PCM resampling passed:', rate, 'Hz');
}
