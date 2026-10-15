#!/usr/bin/env node
// lykeion CLI: every deterministic step of the workflow lives here (ADR 0004).
const COMMANDS = {
  extract: () => import('../src/extract.mjs'),
  build: () => import('../src/build.mjs'),
  verify: () => import('../src/verify.mjs'),
  palette: () => import('../src/palette.mjs'),
};

const USAGE = `usage: lykeion <command> [options]

commands:
  extract   PDF → per-page text + images
  build     content Markdown → single-file Lecture Site
  verify    run the verification gates on a built Lecture Site
  palette   check Palettes / render the Palette Specimen

Run "lykeion <command> --help" for details.`;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}
const load = COMMANDS[cmd];
if (!load) {
  console.error(`unknown command "${cmd}"\n\n${USAGE}`);
  process.exit(1);
}

try {
  const mod = await load();
  if (args.includes('--help') || args.includes('-h')) {
    console.log(mod.help);
  } else {
    await mod.run(args);
  }
} catch (err) {
  console.error(`lykeion ${cmd}: ${err.message}`);
  process.exit(1);
}
