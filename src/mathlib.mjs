// Shared maths loading: runtime/mathlib.js plus an optional <project>/math.js.
// The page inlines both, and every Node-side evaluation (the numeric gate) must use the same
// pair, or a `calc` could pass in the browser and fail here (or the reverse).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function mathlibSource() {
  return readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
}

// The project's own helpers, or '' when it ships none.
export async function projectMathSource(dir) {
  try {
    return await readFile(join(dir, 'math.js'), 'utf8');
  } catch {
    return '';
  }
}

// Run the project's math.js against a LykeionMath instance. A syntax error or a throw here is a
// build error naming the file, rather than a page that half-works for the reader.
export function applyProjectMath(M, src) {
  try {
    new Function('LykeionMath', `${src}\n`)(M);
  } catch (e) {
    throw new Error(`math.js: ${e.message}`);
  }
  return M;
}

// A fresh LykeionMath with the project's helpers registered.
export async function loadMath(dir) {
  const src = await mathlibSource();
  const M = new Function(`${src}\nreturn LykeionMath;`)();
  const project = dir ? await projectMathSource(dir) : '';
  if (project.trim()) applyProjectMath(M, project);
  return M;
}
