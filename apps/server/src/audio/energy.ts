/** RMS of a PCM16 little-endian mono chunk. */
export function rms(pcm: Buffer): number {
  const samples = pcm.length >> 1;
  if (!samples) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = pcm.readInt16LE(i * 2);
    sum += v * v;
  }
  return Math.sqrt(sum / samples);
}

/** Chunks above this RMS count as speech. Tunable via env for noisy rooms. */
export const SPEECH_RMS = Number(process.env.SPEECH_RMS_THRESHOLD ?? 500);
