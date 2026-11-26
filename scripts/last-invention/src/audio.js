/* THE LAST INVENTION · audio.js
   A generative score synthesized live with the Web Audio API. Nothing is downloaded.
   It stays silent until the viewer turns it on (M, or the Sound button).
   The harmony follows the acts, and the drone brightens as the talk climbs the curve. */
(() => {
  'use strict';
  const TLI = window.TLI;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { TLI.audio = { toggle: () => false, setAct() {}, sfx() {}, on: () => false }; return; }

  const CHORDS = [
    [110.0, 164.81, 246.94, 261.63], // prologue: A minor, add 9
    [110.0, 164.81, 246.94, 329.63], // act I
    [87.31, 130.81, 196.0, 329.63],  // act II: F major 7, lifting
    [73.42, 146.83, 220.0, 349.23],  // act III: D minor, tension
    [82.41, 164.81, 246.94, 293.66], // act IV: E minor 7, unresolved
    [110.0, 164.81, 277.18, 329.63], // act V: A major, resolution
  ];
  const ROOTS = [55, 55, 43.65, 36.71, 41.2, 55];
  let ctx = null, master, verbIn, dry, droneF, droneGain, noiseBuf;
  const drones = [], pads = [];
  let on = false, act = 0, prog = 0, timer = 0, beatAt = 0;

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.5;
    master.connect(comp); comp.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = impulse(5.5, 2.6);
    verbIn = ctx.createGain(); verbIn.gain.value = 0.85; verbIn.connect(verb);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.5; verb.connect(verbOut); verbOut.connect(master);
    dry = ctx.createGain(); dry.gain.value = 0.65; dry.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

    droneF = ctx.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 240; droneF.Q.value = 0.8;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.14;
    droneF.connect(droneGain); droneGain.connect(dry); droneGain.connect(verbIn);
    [-8, 0, 7].forEach((det, k) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = ROOTS[0]; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = k === 1 ? 0.22 : 0.15;
      o.connect(g); g.connect(droneF); o.start(); drones.push(o);
    });
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = ROOTS[0];
    const sg = ctx.createGain(); sg.gain.value = 0.16; sub.connect(sg); sg.connect(dry); sub.start(); drones.push(sub);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lg = ctx.createGain(); lg.gain.value = 110; lfo.connect(lg); lg.connect(droneF.frequency); lfo.start();

    CHORDS[0].forEach((f, k) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; o2.detune.value = 5;
      const g = ctx.createGain(); g.gain.value = 0.04;
      const trem = ctx.createOscillator(); trem.frequency.value = 0.07 + k * 0.023;
      const tg = ctx.createGain(); tg.gain.value = 0.018; trem.connect(tg); tg.connect(g.gain);
      o.connect(g); o2.connect(g); g.connect(verbIn); g.connect(dry);
      o.start(); o2.start(); trem.start();
      pads.push({ o, o2, g });
    });
  }

  function setAct(a, p) {
    act = a || 0; prog = p || 0;
    if (!ctx || !on) return;
    const t = ctx.currentTime, ch = CHORDS[act] || CHORDS[0];
    pads.forEach((v, k) => { v.o.frequency.setTargetAtTime(ch[k], t, 1.2); v.o2.frequency.setTargetAtTime(ch[k] * 2, t, 1.2); });
    drones.forEach((o) => o.frequency.setTargetAtTime(ROOTS[act] || 55, t, 1.6));
    droneF.frequency.setTargetAtTime(200 + prog * 1000, t, 2.2);
    droneGain.gain.setTargetAtTime(0.11 + prog * 0.07, t, 2.2);
  }

  function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noise(t, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t); s.stop(t + dur); return s; }
  function plink(t) {
    const ch = CHORDS[act] || CHORDS[0];
    const f = ch[Math.floor(Math.random() * ch.length)] * (Math.random() < 0.5 ? 4 : 8);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); env(g, t, 0.05, 0.01, 1.6 + Math.random());
    o.connect(g); g.connect(verbIn); g.connect(dry);
    o.start(t); o.stop(t + 3);
  }
  function thump(t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.28);
    const g = ctx.createGain(); env(g, t, 0.32, 0.008, 0.42);
    o.connect(g); g.connect(dry); o.start(t); o.stop(t + 0.6);
  }
  const SFX = {
    whoosh(t) {
      const s = noise(t, 2.2), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(3200, t + 1.1); f.frequency.exponentialRampToValueAtTime(400, t + 2.1);
      const g = ctx.createGain(); env(g, t, 0.32, 0.6, 1.4);
      s.connect(f); f.connect(g); g.connect(dry); g.connect(verbIn);
    },
    boom(t) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
      const g = ctx.createGain(); env(g, t, 0.7, 0.01, 2.2);
      o.connect(g); g.connect(dry); g.connect(verbIn); o.start(t); o.stop(t + 2.5);
      const s = noise(t, 1.2), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.1);
      const g2 = ctx.createGain(); env(g2, t, 0.4, 0.005, 1.1);
      s.connect(f); f.connect(g2); g2.connect(dry); g2.connect(verbIn);
    },
    tick(t) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1320;
      const g = ctx.createGain(); env(g, t, 0.035, 0.004, 0.08);
      o.connect(g); g.connect(dry); g.connect(verbIn); o.start(t); o.stop(t + 0.15);
    },
    blip(t, k) {
      const ch = CHORDS[act] || CHORDS[0];
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = ch[(k || 0) % 4] * Math.pow(2, 1 + Math.floor((k || 0) / 4));
      const g = ctx.createGain(); env(g, t, 0.08, 0.01, 0.5);
      o.connect(g); g.connect(dry); g.connect(verbIn); o.start(t); o.stop(t + 0.7);
    },
    rise(t) {
      const s = noise(t, 2.4), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4200, t + 2.2);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      s.connect(f); f.connect(g); g.connect(verbIn); g.connect(dry);
    },
    swell(t) {
      const ch = CHORDS[5];
      [1, 2, 3, 4].forEach((m, k) => {
        const o = ctx.createOscillator(); o.type = k % 2 ? 'sine' : 'triangle'; o.frequency.value = ch[k] * 2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
        o.connect(g); g.connect(verbIn); g.connect(dry); o.start(t); o.stop(t + 9.5);
      });
      SFX.whoosh(t);
    },
  };
  function sfx(name, arg) {
    if (!ctx || !on || !SFX[name]) return;
    try { SFX[name](ctx.currentTime + 0.01, arg); } catch (e) { /* audio is decorative */ }
  }
  function loop() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!on || document.hidden) return;
      const t = ctx.currentTime;
      if (Math.random() < 0.03 + prog * 0.2) plink(t + Math.random() * 0.1);
      const beat = act === 3 ? 0.84 : act === 2 && prog > 0.4 ? 1.25 : 0;
      if (beat && t >= beatAt) { thump(t + 0.02); beatAt = t + beat; }
    }, 110);
  }
  function toggle(a, p) {
    if (!ctx) { try { build(); } catch (e) { return false; } }
    on = !on;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    if (on) {
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.linearRampToValueAtTime(0.85, t + 2.5);
      setAct(a, p);
      loop();
    } else {
      master.gain.linearRampToValueAtTime(0.0001, t + 0.8);
      clearInterval(timer);
      setTimeout(() => { if (!on && ctx.state === 'running') ctx.suspend(); }, 900);
    }
    return on;
  }
  TLI.audio = { toggle, setAct, sfx, on: () => on };
})();
