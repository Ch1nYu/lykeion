// User-level configuration. Personal data never lives in the repo (ADR 0003).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

export function configDir() {
  return process.env.LYKEION_CONFIG_DIR || join(homedir(), '.config', 'lykeion');
}

const DEFAULTS = { depth: 'standard', language: 'zh-Hant-TW', fixtures: {} };

export async function loadConfig() {
  try {
    const raw = await readFile(join(configDir(), 'config.json'), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULTS };
    throw new Error(`Cannot read ${join(configDir(), 'config.json')}: ${err.message}`);
  }
}

export async function saveConfig(cfg) {
  await mkdir(configDir(), { recursive: true });
  await writeFile(join(configDir(), 'config.json'), JSON.stringify(cfg, null, 2) + '\n');
}
