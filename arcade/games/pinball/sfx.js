// Dust Devil Pinball sound effects: every one synthesized through the cabinet's audio
// helpers (h.tone / h.noise / h.seq), short and quiet. No assets.
export function createSfx(audio) {
  const BUMPER_PITCH = [1, 1.122, 1.26];
  const LANE_NOTE = [659, 784, 988];
  return {
    flip() {
      audio.play('pb-flip', (h) => {
        h.tone({ f: 170, slideTo: 70, dur: 0.06, type: 'triangle', vol: 0.07 });
        h.noise({ dur: 0.03, vol: 0.025, filterFrom: 1600, filterTo: 300 });
      });
    },
    bumper(i = 0) {
      const k = BUMPER_PITCH[i % 3];
      audio.play('pb-bumper', (h) => {
        h.tone({ f: 420 * k, slideTo: 760 * k, dur: 0.07, type: 'square', vol: 0.045 });
        h.tone({ f: 880 * k, dur: 0.05, type: 'triangle', vol: 0.03, at: 0.012 });
      });
    },
    sling() {
      audio.play('pb-sling', (h) => {
        h.noise({ dur: 0.06, vol: 0.045, filterFrom: 3000, filterTo: 600 });
        h.tone({ f: 280, slideTo: 150, dur: 0.07, type: 'sawtooth', vol: 0.035 });
      });
    },
    spin() {
      audio.play('pb-spin', (h) => h.tone({ f: 1500, dur: 0.018, type: 'square', vol: 0.014 }));
    },
    target() {
      audio.play('pb-target', (h) => {
        h.noise({ dur: 0.07, vol: 0.055, filterFrom: 1800, filterTo: 200 });
        h.tone({ f: 210, slideTo: 110, dur: 0.09, type: 'triangle', vol: 0.05 });
      });
    },
    bank() {
      audio.play('pb-bank', (h) => h.seq([
        { f: 523, vol: 0.05, type: 'triangle' }, { f: 659, vol: 0.05, type: 'triangle' },
        { f: 784, vol: 0.05, type: 'triangle' }, { f: 1047, vol: 0.06, type: 'triangle', dur: 0.18 },
      ], 0.07));
    },
    lane(i = 0, fresh = true) {
      audio.play('pb-lane', (h) => {
        h.tone({ f: LANE_NOTE[i % 3], dur: 0.08, type: 'sine', vol: fresh ? 0.05 : 0.025 });
        if (fresh) h.tone({ f: LANE_NOTE[i % 3] * 2, dur: 0.06, type: 'triangle', vol: 0.025, at: 0.04 });
      });
    },
    laneSet() {
      audio.play('pb-laneset', (h) => h.seq([
        { f: 784, vol: 0.05 }, { f: 988, vol: 0.05 }, { f: 1175, vol: 0.05 }, { f: 1568, vol: 0.06, dur: 0.16 },
      ], 0.06));
    },
    launch() {
      audio.play('pb-launch', (h) => {
        h.noise({ dur: 0.22, vol: 0.05, filterFrom: 500, filterTo: 2600 });
        h.tone({ f: 90, slideTo: 260, dur: 0.18, type: 'sawtooth', vol: 0.035 });
      });
    },
    gate() {
      audio.play('pb-gate', (h) => h.tone({ f: 740, slideTo: 520, dur: 0.05, type: 'triangle', vol: 0.03 }));
    },
    orbit() {
      audio.play('pb-orbit', (h) => h.tone({ f: 440, slideTo: 1320, dur: 0.22, type: 'triangle', vol: 0.045 }));
    },
    orbitTop() {
      audio.play('pb-orbit-top', (h) => h.seq([{ f: 880, vol: 0.05, type: 'triangle' }, { f: 1320, vol: 0.05, type: 'triangle', dur: 0.14 }], 0.06));
    },
    drain() {
      audio.play('pb-drain', (h) => {
        h.tone({ f: 330, slideTo: 55, dur: 0.55, type: 'sawtooth', vol: 0.05 });
        h.noise({ dur: 0.3, vol: 0.035, filterFrom: 1400, filterTo: 80 });
      });
    },
    saved() {
      audio.play('pb-saved', (h) => h.seq([
        { f: 523, vol: 0.05 }, { f: 659, vol: 0.05 }, { f: 784, vol: 0.05 }, { f: 1047, vol: 0.06, dur: 0.18 },
      ], 0.07));
    },
    skill() {
      audio.play('pb-skill', (h) => h.seq([
        { f: 988, vol: 0.055 }, { f: 1319, vol: 0.055 }, { f: 1568, vol: 0.055 }, { f: 1976, vol: 0.06 },
        { f: 2637, vol: 0.06, dur: 0.22 },
      ], 0.06));
    },
    extra() {
      audio.play('pb-extra', (h) => h.seq([
        { f: 659, vol: 0.055 }, { f: 784, vol: 0.055 }, { f: 988, vol: 0.055 }, { f: 1319, vol: 0.055 },
        { f: 988, vol: 0.05 }, { f: 1319, vol: 0.06 }, { f: 1760, vol: 0.065, dur: 0.26 },
      ], 0.07));
    },
    jackpot() {
      audio.play('pb-jackpot', (h) => h.seq([
        { f: 523, vol: 0.05 }, { f: 659, vol: 0.05 }, { f: 784, vol: 0.05 }, { f: 1047, vol: 0.055 },
        { f: 1319, vol: 0.055 }, { f: 1568, vol: 0.06 }, { f: 2093, vol: 0.065, dur: 0.3 },
      ], 0.06));
    },
    tilt() {
      audio.play('pb-tilt', (h) => {
        h.tone({ f: 75, dur: 0.55, type: 'sawtooth', vol: 0.06 });
        h.tone({ f: 56, dur: 0.55, type: 'square', vol: 0.04 });
      });
    },
    warn() {
      audio.play('pb-warn', (h) => h.seq([{ f: 196, vol: 0.06, type: 'square' }, null, { f: 196, vol: 0.06, type: 'square' }], 0.09));
    },
    nudge() {
      audio.play('pb-nudge', (h) => h.noise({ dur: 0.06, vol: 0.04, filterFrom: 700, filterTo: 150 }));
    },
    wall(speed = 300) {
      const vol = Math.min(0.03, 0.004 + speed / 40000);
      audio.play('pb-wall', (h) => h.noise({ dur: 0.02, vol, filterFrom: 2400, filterTo: 700 }));
    },
    bonusTick() {
      audio.play('pb-bonus', (h) => h.tone({ f: 880, dur: 0.02, type: 'square', vol: 0.018 }));
    },
    serve() {
      audio.play('pb-serve', (h) => h.tone({ f: 520, slideTo: 640, dur: 0.04, type: 'triangle', vol: 0.03 }));
    },
    over() {
      audio.play('pb-over', (h) => h.seq([
        { f: 659, vol: 0.055 }, { f: 523, vol: 0.055 }, { f: 392, vol: 0.055 }, { f: 262, vol: 0.06, dur: 0.3 },
      ], 0.12));
    },
  };
}
