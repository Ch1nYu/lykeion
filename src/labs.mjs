// `lykeion labs`: what every Lab shows, as text, at the settings a reviewer would try first — the
// values it opens on, and each control at its lowest and highest. A reviewer who cannot move a slider
// in a browser (a sub-agent with no browser, a headless dump that never runs the Lab's script) can
// still judge whether a Lab teaches anything: whether its readouts move and its verdict changes.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadMath } from './mathlib.mjs';

export const help = `lykeion labs [project-dir] [--json]

Prints every Lab of the last build ("lykeion build" first) with what it shows: its readouts and
the verdict shown, at the values it opens on, then with each control at its min and at its max
(the others at their opening values). A table Lab is shown after each of its actions; a curve Lab
with its marker at the opening value and at both ends of x. Stepper and custom Labs are listed with
what can be said without running them.

A Lab whose verdict is the same in every state is marked: moving its controls changes nothing it says.

--json   the same as JSON, for a script or an agent`;

export async function run(args) {
  const dir = resolve(args.find((a) => !a.startsWith('--')) || '.');
  for (const a of args) if (a.startsWith('--') && a !== '--json') throw new Error(`Unknown option ${a}`);
  const labs = await labStates(dir);
  console.log(args.includes('--json') ? JSON.stringify(labs, null, 2) : formatLabs(labs));
}

// Plain text of a Markdown/HTML sentence: what the reader reads, maths delimiters kept.
const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\*\*|__/g, '').trim();
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export async function labStates(dir) {
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8').catch(() => { throw new Error(`no checks.json in ${dir}; run "lykeion build" first`); }));
  if (!Array.isArray(checks.labs)) throw new Error('checks.json was written before Labs were recorded — run "lykeion build" again');
  const M = await loadMath(dir);
  return checks.labs.map(({ where, type, params: p }) => {
    const lab = { where, type, tag: p.tag || null, title: plain(p.title), hint: plain(p.hint) || null };
    const describe = DESCRIBE[type];
    if (!describe) return { ...lab, states: [], note: `custom Lab type "${type}": its outputs are its own code, so it is not evaluated here — open the page to see it` };
    try {
      const out = describe(p, M);
      const verdicts = new Set(out.states.map((s) => s.verdict).filter((v) => v !== undefined));
      if (out.states.length > 1 && (p.verdict || []).length && verdicts.size === 1) out.note = [out.note, 'the verdict is the same in every state: moving the controls changes nothing it says'].filter(Boolean).join('; ');
      return { ...lab, ...out };
    } catch (e) {
      return { ...lab, states: [], note: `cannot be evaluated: ${e.message.split('\n')[0]}` };
    }
  });
}

// The verdict shown in a state: the first `when` that holds, as the Labs pick it.
const verdictOf = (list, compiled, state) => {
  if (!list.length) return undefined;
  for (const [i, fn] of compiled.entries()) {
    let ok = false;
    try { ok = !!fn(state); } catch { /* a throwing condition is false, as on the page */ }
    if (ok) return plain(list[i].text);
  }
  return null; // the verdict line is blank
};
const readout = (o, fn, state) => {
  let v;
  try { v = Number(fn(state)); } catch { v = NaN; }
  const text = o.labels && Object.prototype.hasOwnProperty.call(o.labels, String(v)) ? o.labels[String(v)] : fmt(v, o.digits == null ? 3 : o.digits);
  return { label: plain(o.label), value: Number.isFinite(v) ? v : null, text };
};

const DESCRIBE = {
  'slider-calc'(p, M) {
    const inputs = (p.inputs || []).filter((i) => i && i.id);
    const ids = inputs.map((i) => i.id);
    const reads = [...(p.outputs || []), ...(p.bars || [])].map((o) => ({ o, fn: M.compile(String(o.expr), ids) }));
    const verdict = p.verdict || [];
    const whens = verdict.map((v) => M.compile(String(v.when), ids));
    const opening = Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)]));
    const state = (name, s) => ({ name, inputs: s, readouts: reads.map(({ o, fn }) => readout(o, fn, s)), verdict: verdictOf(verdict, whens, s) });
    const states = [state('opening', opening)];
    for (const i of inputs) {
      const ends = Array.isArray(i.options)
        ? [['first option', i.options[0]], ['last option', i.options.at(-1)]].map(([n, o]) => [n, Number(o && typeof o === 'object' ? o.value : o)])
        : [['min', Number(i.min)], ['max', Number(i.max)]];
      for (const [n, v] of ends) if (Number.isFinite(v) && v !== opening[i.id]) states.push(state(`${i.id} at ${n}`, { ...opening, [i.id]: v }));
    }
    return { states };
  },
  table(p, M) {
    const names = p.names || [];
    const flat = [].concat(...names);
    const initial = {};
    names.forEach((row, r) => row.forEach((n, c) => { initial[n] = Number(p.values?.[r]?.[c]) || 0; }));
    const reads = (p.outputs || []).map((o) => ({ o, fn: M.compile(String(o.expr), flat) }));
    const verdict = p.verdict || [];
    const whens = verdict.map((v) => M.compile(String(v.when), flat));
    const state = (name, s) => ({ name, inputs: s, readouts: reads.map(({ o, fn }) => readout(o, fn, s)), verdict: verdictOf(verdict, whens, s) });
    const states = [state('opening', initial)];
    // Each action once, from the opening values, as a reader's first press would apply it.
    for (const a of p.actions || []) {
      if (a.reset) continue;
      const next = { ...initial };
      for (const [k, expr] of Object.entries(a.set || {})) next[k] = Math.max(0, Number(M.compile(String(expr), flat)(initial)) || 0);
      states.push(state(`after "${plain(a.label)}"`, next));
    }
    return { states, note: 'the cells can also be typed into; only the opening values and the actions are shown' };
  },
  curve(p, M) {
    const X = p.x || { min: 0, max: 1 };
    const inputs = (p.inputs || []).filter((i) => i && i.id);
    const ids = ['x', ...inputs.map((i) => i.id)];
    const curves = (p.curves || []).map((c) => ({ o: { label: c.label }, fn: M.compile(String(c.expr), ids) }));
    const opening = Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)]));
    if (!p.marker) return { states: [], note: 'no marker, so it shows curves and no readouts; open the page to see the shapes' };
    const at = Number(p.marker.value ?? (X.min + X.max) / 2);
    const state = (name, s) => ({ name, inputs: s, readouts: curves.map(({ o, fn }) => readout(o, fn, s)) });
    const states = [state('opening', { ...opening, x: at })];
    for (const [n, x] of [['x at min', Number(X.min)], ['x at max', Number(X.max)]]) if (x !== at) states.push(state(n, { ...opening, x }));
    for (const i of inputs) {
      for (const [n, v] of [['min', Number(i.min)], ['max', Number(i.max)]]) if (v !== opening[i.id]) states.push(state(`${i.id} at ${n}`, { ...opening, x: at, [i.id]: v }));
    }
    return { states };
  },
  stepper(p) {
    const steps = (p.steps || []).map((s, i) => `${i + 1}. ${plain(s.label)}${s.text ? ` — ${plain(s.text)}` : ''}`);
    return { states: [], steps, note: `${steps.length} step(s), shown one at a time` };
  },
};

export function formatLabs(labs) {
  if (!labs.length) return 'No Labs in this build.';
  const lines = [];
  for (const lab of labs) {
    lines.push(`${lab.where} — ${[lab.tag, lab.title].filter(Boolean).join(' ')} (${lab.type})`);
    if (lab.hint) lines.push(`  hint: ${lab.hint}`);
    for (const s of lab.states) {
      const set = Object.entries(s.inputs).map(([k, v]) => `${k}=${v}`).join(', ');
      const reads = s.readouts.map((r) => `${r.label} ${r.text}`).join(' · ');
      lines.push(`  ${s.name}${set ? ` (${set})` : ''}: ${reads || '(no readouts)'}`);
      if (s.verdict !== undefined) lines.push(`    verdict: ${s.verdict ?? '(none — the verdict line is blank)'}`);
    }
    for (const step of lab.steps || []) lines.push(`  ${step}`);
    if (lab.note) lines.push(`  note: ${lab.note}`);
    lines.push('');
  }
  return lines.join('\n');
}
