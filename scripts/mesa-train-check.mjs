// The training gate for Mesa Lander's "watch it learn" mode: can the hand-written
// PPO learner teach itself to land, from scratch, in 60 seconds of one CPU core?
//
//   node scripts/mesa-train-check.mjs [--seeds 1,2,3,4,5] [--seconds 60] [--every 10] [--stop]
//                                     [--json out.json] [--hyper lr=0.001] [--reward land=20] ...
//
// For each seed it builds a brand new learner (random weights, no pre-training),
// lets it fly and learn headlessly for the time budget, and reports when the
// landing rate over its last 50 training attempts first reached 50% and 70%.
// Bar: at least 4 of 5 seeds reach 70% within the budget. Not part of `npm test`.
// Everything runs in this one thread: no timers, no workers, and the process exits
// by itself when the last seed is done.
//
// Experiments: --hyper, --reward, --start, --setup, --limits and --phys override the
// shipped defaults (key=value pairs, ranges as lo:hi); --steps N budgets by
// decisions instead of seconds, which keeps runs comparable on a busy machine.
import { writeFileSync } from 'node:fs';
import { Learner, HYPER } from '../arcade/games/mesa/learn.js';
import { REWARD, START, SETUP } from '../arcade/games/mesa/env.js';
import { LIMITS, PHYS } from '../arcade/games/mesa/physics.js';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[argv[i].slice(2)] = true;
    else { args[argv[i].slice(2)] = next; i++; }
  }
}
const seeds = String(args.seeds ?? '1,2,3,4,5').split(',').map(Number);
const budget = Number(args.seconds ?? 60);
const stepBudget = args.steps ? Number(args.steps) : Infinity;
const every = Number(args.every ?? 0);
const stopAtGoal = Boolean(args.stop);
const WINDOW = 50;

const overrides = (flag, target, convert = Number) => {
  if (typeof args[flag] !== 'string') return;
  for (const kv of args[flag].split(',')) {
    const [k, v] = kv.split('=');
    if (!(k in target)) throw new Error(`unknown ${flag} setting ${k}`);
    target[k] = convert(v);
  }
};
overrides('hyper', HYPER);
overrides('reward', REWARD);
overrides('start', START, (v) => v.split(':').map(Number));
overrides('setup', SETUP);
overrides('limits', LIMITS);
overrides('phys', PHYS);

const fmt = (x, d = 1) => x.toFixed(d);
const results = [];
const config = { hyper: HYPER, reward: REWARD, start: START, setup: SETUP, limits: LIMITS, phys: PHYS };
console.log(`Mesa Lander training gate: ${seeds.length} seeds, ${stepBudget < Infinity ? `${stepBudget} decisions` : `${budget} s`} each`);
console.log(`config ${JSON.stringify(config)}`);

for (const seed of seeds) {
  const mark = { first: null, p50: null, p70: null };
  let wall0 = 0;
  const learner = new Learner({
    seed,
    onEpisode(outcome) {
      // The learner has already counted this attempt when it calls the hook.
      const t = (performance.now() - wall0) / 1000;
      const ep = learner.episodes;
      const steps = learner.steps;
      if (outcome === 1 && !mark.first) mark.first = { ep, t, steps };
      if (ep >= WINDOW) {
        const r = learner.rate(WINDOW);
        if (r >= 0.5 && !mark.p50) mark.p50 = { ep, t, steps };
        if (r >= 0.7 && !mark.p70) mark.p70 = { ep, t, steps };
      }
    },
  });
  const cpu0 = process.cpuUsage();
  wall0 = performance.now();
  let nextPrint = every;
  let units = 0;
  for (;;) {
    learner.advance();
    if ((++units & 3) !== 0) continue;
    const t = (performance.now() - wall0) / 1000;
    if (every > 0 && t >= nextPrint) {
      nextPrint += every;
      const st = learner.stats;
      console.log(`  [seed ${seed}] ${t.toFixed(0).padStart(3)}s  steps ${String(learner.steps).padStart(7)}  attempts ${String(learner.episodes).padStart(5)}  `
        + `rate50 ${(learner.rate(50) * 100).toFixed(0).padStart(3)}%  entropy ${st.ent.toFixed(2)}  kl ${st.kl.toFixed(4)}  expVar ${st.explVar.toFixed(2)}`);
    }
    if (t >= budget || learner.steps >= stepBudget) break;
    if (stopAtGoal && mark.p70) break;
  }
  const wall = (performance.now() - wall0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  const cpuSec = (cpu.user + cpu.system) / 1e6;
  const res = {
    seed,
    steps: learner.steps,
    attempts: learner.episodes,
    first: mark.first,
    p50: mark.p50,
    p70: mark.p70,
    finalRate: learner.rate(WINDOW),
    stepsPerSec: learner.steps / wall,
    wall,
    cpuSec,
  };
  results.push(res);
  const cell = (m) => (m ? `${String(m.ep).padStart(5)} att ${fmt(m.t).padStart(5)} s ${String(Math.round(m.steps / 1000)).padStart(4)}k` : '       never          ');
  console.log(`seed ${seed}: first landing ${cell(mark.first)} | 50% ${cell(mark.p50)} | 70% ${cell(mark.p70)} | `
    + `final ${(res.finalRate * 100).toFixed(0)}% after ${res.attempts} attempts, ${res.steps} decisions `
    + `(${Math.round(res.stepsPerSec)}/s, ${wall.toFixed(1)} s wall, ${cpuSec.toFixed(1)} s cpu)`);
}

const within = (r) => r.p70 && (stepBudget < Infinity || r.p70.t <= budget);
const passed = results.filter(within).length;
const unit = stepBudget < Infinity ? `${stepBudget} decisions` : `${budget} s`;
console.log(`\nSeeds reaching 70% within ${unit}: ${passed} of ${results.length}. Gate (at least 4 of 5): ${passed >= 4 && results.length >= 5 ? 'PASS' : 'FAIL'}`);
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ config, budget, results }, null, 1));
