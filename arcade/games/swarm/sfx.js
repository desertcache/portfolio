// Swarm sound effects: every one synthesized through the cabinet's audio
// helpers (h.tone / h.noise / h.seq). No assets.
export function createSfx(audio) {
  return {
    shot() {
      audio.play('swarm-shot', (h) => {
        h.tone({ f: 1320, slideTo: 380, dur: 0.09, type: 'square', vol: 0.045 });
        h.tone({ f: 2640, slideTo: 900, dur: 0.05, type: 'triangle', vol: 0.03 });
      });
    },
    enemyShot() {
      audio.play('swarm-bolt', (h) => h.tone({ f: 620, slideTo: 240, dur: 0.1, type: 'triangle', vol: 0.05 }));
    },
    armor() {
      audio.play('swarm-armor', (h) => {
        h.tone({ f: 240, slideTo: 720, dur: 0.11, type: 'square', vol: 0.06 });
        h.tone({ f: 1500, dur: 0.05, type: 'triangle', vol: 0.04, at: 0.03 });
      });
    },
    boom(big) {
      audio.play(big ? 'swarm-boom-big' : 'swarm-boom', (h) => {
        h.noise({ dur: big ? 0.45 : 0.26, vol: big ? 0.2 : 0.13, filterFrom: big ? 2200 : 3400, filterTo: 90 });
        h.tone({ f: big ? 220 : 320, slideTo: 45, dur: big ? 0.35 : 0.18, type: 'triangle', vol: 0.08 });
      });
    },
    dive() {
      // The falling whistle of an incoming diver, two detuned voices.
      audio.play('swarm-dive', (h) => {
        h.tone({ f: 1960, slideTo: 380, dur: 1.15, type: 'sine', vol: 0.05, attack: 0.06 });
        h.tone({ f: 1930, slideTo: 372, dur: 1.15, type: 'triangle', vol: 0.025, attack: 0.06 });
      });
    },
    death() {
      audio.play('swarm-death', (h) => {
        h.noise({ dur: 0.9, vol: 0.26, filterFrom: 1800, filterTo: 60 });
        h.tone({ f: 260, slideTo: 38, dur: 0.85, type: 'sawtooth', vol: 0.11 });
        h.tone({ f: 130, slideTo: 30, dur: 0.6, type: 'square', vol: 0.05, at: 0.1 });
      });
    },
    wave() {
      audio.play('swarm-wave', (h) => h.seq([
        { f: 523, vol: 0.07 }, { f: 659, vol: 0.07 }, { f: 784, vol: 0.07 },
        null, { f: 1047, vol: 0.08, dur: 0.2 },
      ], 0.09));
    },
    practice() {
      audio.play('swarm-practice', (h) => h.seq([
        { f: 784, vol: 0.06, type: 'triangle' }, { f: 988, vol: 0.06, type: 'triangle' },
        { f: 1175, vol: 0.06, type: 'triangle' }, { f: 1568, vol: 0.07, type: 'triangle', dur: 0.22 },
      ], 0.08));
    },
    clear() {
      audio.play('swarm-clear', (h) => h.seq([
        { f: 880, vol: 0.06 }, { f: 1109, vol: 0.06 }, { f: 1319, vol: 0.06 }, { f: 1760, vol: 0.07, dur: 0.18 },
      ], 0.07));
    },
    bonus() {
      audio.play('swarm-bonus', (h) => h.seq([
        { f: 1047, vol: 0.06 }, { f: 1319, vol: 0.06 }, { f: 1568, vol: 0.06 },
        { f: 2093, vol: 0.07 }, { f: 1568, vol: 0.05 }, { f: 2093, vol: 0.08, dur: 0.25 },
      ], 0.07));
    },
    extra() {
      audio.play('swarm-extra', (h) => h.seq([
        { f: 988, vol: 0.07 }, { f: 1319, vol: 0.07 }, { f: 1976, vol: 0.08 }, { f: 2637, vol: 0.06, dur: 0.2 },
      ], 0.06));
    },
  };
}
