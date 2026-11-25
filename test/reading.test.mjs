import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from '../src/build.mjs';
import {launchBrowser} from '../src/browser.mjs';

test('continuous mode is opt-in, preserves essential prose and collapses only notes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lykeion-reading-'));await mkdir(join(dir,'content'));
 const config={title:'Reading test',palette:'desk-teal',output:'index.html'};
 await writeFile(join(dir,'lykeion.json'),JSON.stringify(config));
 await writeFile(join(dir,'content/01-reading.md'),'---\nchapter: 1\ntitle: 閱讀\n---\n## 1.1 問題\n\n必要的前提。\n\n```callout 定義\n必要的定義。\n```\n\n```note\n補充提醒\n可選的例外。\n```\n');
 await build(dir);assert.ok(!(await readFile(join(dir,'index.html'),'utf8')).includes('details.reading-note'));
 await writeFile(join(dir,'lykeion.json'),JSON.stringify({...config,reading:'unknown'}));await assert.rejects(build(dir),/reading must be/);
 await writeFile(join(dir,'lykeion.json'),JSON.stringify({...config,reading:'continuous'}));await build(dir);
 const b=await launchBrowser();assert.ok(b,'browser required for this acceptance check');
 try{const p=await b.newPage();await p.route(/^https?:/,r=>r.abort());await p.goto(pathToFileURL(join(dir,'index.html')).href+'#ch1');
  assert.equal(await p.locator('.reading-note').count(),1);
  assert.equal(await p.locator('#ch1 .callout').isVisible(),true);
  assert.equal(await p.locator('#ch1 .prose>p').isVisible(),true);
  assert.equal(await p.locator('.reading-note .note').isVisible(),false);
  await p.locator('.reading-note summary').click();assert.equal(await p.locator('.reading-note .note').isVisible(),true);
  assert.match(await p.locator('#ch1').innerText(),/必要的定義/);
 }finally{await b.close();}
});
