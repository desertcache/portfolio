// Mesa Lander's sounds, all synthesized through the cabinet's audio helpers (no files).
// Short and quiet on purpose: the engine is a soft hiss, not a roar.
export function createSfx(audio) {
  let noiseBuf = null;
  let hiss = null; // the engine's gain node, while its loop exists
  let rumble = null;
  // A new scene starts with an empty loop slot, so the engine always gets rebuilt.
  audio.stopLoop();

  // A low hiss with a faint rumble under it. Built once per press of the engine.
  function engineLoop(h) {
    const ctx = h.ctx;
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 0.6);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 560;
    const mine = ctx.createGain();
    mine.gain.value = 0.0001;
    src.connect(lp).connect(mine).connect(h.out);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 62;
    const mineLow = ctx.createGain();
    mineLow.gain.value = 0.0001;
    osc.connect(mineLow).connect(h.out);
    src.start();
    osc.start();
    hiss = mine;
    rumble = mineLow;
    return () => {
      const t = ctx.currentTime;
      mine.gain.cancelScheduledValues(t);
      mine.gain.setTargetAtTime(0.0001, t, 0.02);
      mineLow.gain.cancelScheduledValues(t);
      mineLow.gain.setTargetAtTime(0.0001, t, 0.02);
      try { src.stop(t + 0.1); osc.stop(t + 0.1); } catch { /* already stopped */ }
      if (hiss === mine) { hiss = null; rumble = null; }
    };
  }

  // Each tick the engine is on, swell to full and book a fade a moment ahead. If the ticks
  // stop (the player switched games with the engine firing) the sound dies away by itself.
  function swell() {
    if (!hiss) return;
    const t = hiss.context.currentTime;
    hiss.gain.cancelScheduledValues(t);
    hiss.gain.setTargetAtTime(0.055, t, 0.02);
    hiss.gain.setTargetAtTime(0.0001, t + 0.12, 0.03);
    rumble.gain.cancelScheduledValues(t);
    rumble.gain.setTargetAtTime(0.022, t, 0.02);
    rumble.gain.setTargetAtTime(0.0001, t + 0.12, 0.03);
  }

  return {
    engine(on) {
      if (on) {
        audio.setLoop('mesa-engine', engineLoop);
        swell();
      } else {
        audio.stopLoop();
      }
    },
    puff() {
      audio.play('mesa-puff', (h) => h.noise({ dur: 0.06, vol: 0.035, filterFrom: 3200, filterTo: 1200 }));
    },
    land() {
      audio.play('mesa-land', (h) => h.seq([
        { f: 523, type: 'triangle', vol: 0.06 },
        { f: 659, type: 'triangle', vol: 0.06 },
        { f: 784, type: 'triangle', vol: 0.065, dur: 0.2 },
      ], 0.09));
    },
    crash() {
      audio.play('mesa-crash', (h) => {
        h.noise({ dur: 0.42, vol: 0.16, filterFrom: 1700, filterTo: 80 });
        h.tone({ f: 150, slideTo: 38, dur: 0.4, type: 'sawtooth', vol: 0.06 });
      });
    },
    lost() {
      audio.play('mesa-lost', (h) => h.tone({ f: 520, slideTo: 150, dur: 0.5, type: 'sine', vol: 0.05 }));
    },
    level() {
      audio.play('mesa-level', (h) => h.seq([
        { f: 392, type: 'triangle', vol: 0.05 },
        { f: 523, type: 'triangle', vol: 0.05, dur: 0.14 },
      ], 0.1));
    },
    low() {
      audio.play('mesa-low', (h) => h.tone({ f: 880, dur: 0.07, type: 'square', vol: 0.025 }));
    },
    over() {
      audio.play('mesa-over', (h) => h.seq([
        { f: 392, type: 'triangle', vol: 0.055 },
        { f: 311, type: 'triangle', vol: 0.055 },
        { f: 247, type: 'triangle', vol: 0.06, dur: 0.24 },
      ], 0.13));
    },
    // The learning mode is quieter still: a soft chime for a landing, a thud for a crash.
    watchLand() {
      audio.play('mesa-watch-land', (h) => h.tone({ f: 880, slideTo: 1175, dur: 0.12, type: 'triangle', vol: 0.035 }));
    },
    watchCrash() {
      audio.play('mesa-watch-crash', (h) => h.noise({ dur: 0.16, vol: 0.05, filterFrom: 900, filterTo: 90 }));
    },
  };
}
