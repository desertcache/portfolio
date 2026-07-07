// Pac-Man sound recipes, synthesized on the shared WebAudio engine.
// Background loops (siren stages, fright, eyes) use the engine's single
// loop channel; pass the returned names to audio.setLoop each tick.

// The famous two-voice intro jingle (approximation of the original score).
export function playIntro(audio) {
  audio.play('pm-intro', (h) => {
    const B3 = 246.9, Cs4 = 277.2, D4 = 293.7, Ds4 = 311.1, E4 = 329.6,
      F4 = 349.2, Fs4 = 370, G4 = 392, Gs4 = 415.3, B4 = 493.9,
      C4 = 261.6, C5 = 523.3, E5 = 659.3, Fs5 = 740, B5 = 987.8, G5 = 784, A4 = 440;
    const mel = [
      [B4, 0], [B5, 1], [Fs5, 2], [Ds4 * 2, 3], [B5, 4.5], [Fs5, 6], [Ds4 * 2, 8],
      [C5, 12], [C5 * 2, 13], [G5, 14], [E5, 15], [C5 * 2, 16.5], [G5, 18], [E5, 20],
      [B4, 24], [B5, 25], [Fs5, 26], [Ds4 * 2, 27], [B5, 28.5], [Fs5, 30], [Ds4 * 2, 32],
      [Ds4 * 2, 36], [E5, 37], [F4 * 2, 38], [F4 * 2, 40], [Fs5, 41], [G4 * 2, 42],
      [G4 * 2, 44], [Gs4 * 2, 45], [A4 * 2, 46], [B5, 48],
    ];
    const bass = [
      [B3, 0], [B3, 4], [B3, 8], [B3 * 0.75, 10], [C4, 12], [C4, 16], [C4, 20], [C4 * 0.75, 22],
      [B3, 24], [B3, 28], [B3, 32], [B3 * 0.75, 34], [Ds4, 36], [E4, 40], [Fs4, 44], [B3, 48],
    ];
    const STEP = 0.085;
    for (const [f, t] of mel) h.tone({ f, at: t * STEP, dur: STEP * 1.6, type: 'triangle', vol: 0.13 });
    for (const [f, t] of bass) h.tone({ f: f / 2, at: t * STEP, dur: STEP * 3.2, type: 'square', vol: 0.08 });
  });
}

let wakaFlip = false;
export function playWaka(audio) {
  wakaFlip = !wakaFlip;
  if (wakaFlip) {
    audio.play('pm-waka', (h) => h.tone({ f: 550, slideTo: 330, dur: 0.055, type: 'square', vol: 0.1 }));
  } else {
    audio.play('pm-waka', (h) => h.tone({ f: 330, slideTo: 550, dur: 0.055, type: 'square', vol: 0.1 }));
  }
}

export function playFruit(audio) {
  audio.play('pm-fruit', (h) => {
    h.tone({ f: 300, slideTo: 140, dur: 0.12, type: 'square', vol: 0.13 });
    h.tone({ f: 140, slideTo: 420, dur: 0.12, at: 0.12, type: 'square', vol: 0.13 });
  });
}

export function playGhostEat(audio) {
  audio.play('pm-ghost-eat', (h) => h.tone({ f: 180, slideTo: 900, dur: 0.28, type: 'sawtooth', vol: 0.15 }));
}

export function playExtraLife(audio) {
  audio.play('pm-extra-life', (h) => h.seq([
    { f: 880, type: 'square', vol: 0.12 }, { f: 1174, type: 'square', vol: 0.12 },
    { f: 880, type: 'square', vol: 0.12 }, { f: 1174, type: 'square', vol: 0.12 },
    { f: 1568, type: 'square', vol: 0.13 },
  ], 0.09));
}

export function playDeath(audio) {
  audio.play('pm-death', (h) => {
    // Descending warble, then two little puffs.
    for (let i = 0; i < 6; i++) {
      h.tone({ f: 700 - i * 90, slideTo: 480 - i * 70, dur: 0.14, at: i * 0.13, type: 'sawtooth', vol: 0.12 });
    }
    h.noise({ dur: 0.1, vol: 0.12, at: 0.85, filterFrom: 800, filterTo: 200 });
    h.noise({ dur: 0.1, vol: 0.12, at: 1.0, filterFrom: 800, filterTo: 200 });
  });
}

// --- background loops (built once per state change via audio.setLoop) ---

function lfoLoop(h, { carrier, carrierType = 'sawtooth', rate, depth, vol, lowpass = null }) {
  const osc = h.ctx.createOscillator();
  osc.type = carrierType;
  osc.frequency.value = carrier;
  const lfo = h.ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  const lfoGain = h.ctx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain).connect(osc.frequency);
  const gain = h.ctx.createGain();
  gain.gain.value = vol;
  let head = osc;
  if (lowpass) {
    const filter = h.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    head = osc.connect(filter);
  }
  head.connect(gain).connect(h.out);
  osc.start();
  lfo.start();
  return () => {
    try { osc.stop(); lfo.stop(); } catch { /* already stopped */ }
    gain.disconnect();
  };
}

// stage 0..4 — rises as the maze empties. Kept well under the one-shot sfx
// level: it's a background bed, not a foreground voice.
export function sirenLoop(stage) {
  return {
    name: `pm-siren-${stage}`,
    builder: (h) => lfoLoop(h, {
      carrier: 320 + stage * 110,
      rate: 1.4 + stage * 0.35,
      depth: 55 + stage * 18,
      vol: 0.022,
      lowpass: 900,
    }),
  };
}

export const frightLoop = {
  name: 'pm-fright',
  builder: (h) => lfoLoop(h, { carrier: 180, rate: 7, depth: 90, vol: 0.04, lowpass: 1200 }),
};

export const eyesLoop = {
  name: 'pm-eyes',
  builder: (h) => lfoLoop(h, { carrier: 900, carrierType: 'triangle', rate: 5, depth: 350, vol: 0.05 }),
};
