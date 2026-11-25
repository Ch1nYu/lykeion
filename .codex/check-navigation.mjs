import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const watchedFiles = new Set(['src/build.mjs', 'src/markdown.mjs', 'test/markdown.test.mjs']);
const event = JSON.parse(readFileSync(0, 'utf8'));
const patch = event.tool_input?.command ?? '';
const paths = patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm);
const editedNavigation = [...paths].some(([, file]) => {
  const absolute = resolve(event.cwd || process.cwd(), file.trim());
  return watchedFiles.has(relative(project, absolute).split(sep).join('/'));
});

if (editedNavigation) {
  const result = spawnSync(process.execPath, ['--test', 'test/markdown.test.mjs'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 12000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const details = (result.error?.message ?? (result.stdout + result.stderr)).trim().slice(-2000);
    console.log(JSON.stringify({
      systemMessage: 'Lykeion Markdown checks failed. Run node --test test/markdown.test.mjs for details.',
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: details,
      },
    }));
  }
}
