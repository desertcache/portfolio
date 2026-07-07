// WebAudio synth engine — every sound is synthesized, zero audio assets.
// The AudioContext is created lazily on the first user gesture (autoplay
// policy), and nothing is ever scheduled while muted.
export function createAudio({ muted = false, onPlay } = {}) {
  let ctx = null;
  let master = null;
  let isMuted = muted;
  let loopName = null;
  let loopStop = null;
  let userGestured = false;

  function ensure() {
    // Never construct the context before a real user gesture — the browser
    // would refuse it and log an autoplay warning for every attempt.
    if (!userGestured) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // --- synthesis helpers (all schedule relative to ctx.currentTime) ---

  function tone({ f, dur = 0.08, type = 'square', vol = 0.12, at = 0, slideTo = null, attack = 0.002 }) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, vol = 0.15, at = 0, filterFrom = 4000, filterTo = 100 }) {
    const t0 = ctx.currentTime + at;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  function seq(steps, stepDur = 0.09) {
    steps.forEach((step, i) => {
      if (step) tone({ dur: stepDur * 0.9, ...step, at: (step.at ?? 0) + i * stepDur });
    });
  }

  const helpers = { tone, noise, seq, get ctx() { return ctx; }, get out() { return master; } };

  return {
    // Called from a real user-gesture handler; safe to call repeatedly.
    unlock() {
      userGestured = true;
      ensure();
    },

    get ready() { return !!ctx && ctx.state === 'running'; },
    get muted() { return isMuted; },

    setMuted(m) {
      isMuted = m;
      if (m) this.stopLoop();
    },

    // One-shot sfx. `name` feeds the debug sfx log; `fn` gets the helpers.
    play(name, fn) {
      if (isMuted || !ensure()) return;
      if (onPlay) onPlay(name);
      fn(helpers);
    },

    // Single background-loop channel (sirens, thrust rumble). Calling with
    // the same name is a no-op, so games may call this every tick.
    setLoop(name, builder) {
      if (name === loopName) return;
      this.stopLoop();
      if (isMuted || !ensure()) return;
      if (onPlay) onPlay(`loop:${name}`);
      loopName = name;
      loopStop = builder(helpers) || null;
    },

    stopLoop() {
      if (loopStop) loopStop();
      loopStop = null;
      loopName = null;
    },
  };
}
