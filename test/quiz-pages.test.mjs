import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from '../src/build.mjs';

test('end-of-chapter quiz cites its target section, preserving explicit page overrides',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lykeion-quiz-pages-'));await mkdir(join(dir,'content'));
 await writeFile(join(dir,'lykeion.json'),JSON.stringify({title:'Quiz page citations',palette:'desk-teal',output:'index.html'}));
 await writeFile(join(dir,'content/01-test.md'),'---\nchapter: 1\ntitle: Test\n---\n## 1.1 First {pages=153}\n\nFirst.\n\n## 1.2 Second {pages=154}\n\nSecond.\n\n## 1.3 Last {pages=155}\n\nLast.\n\n```quiz Check\n- {q: First?, o: [yes, no], a: 0, ex: First., sec: "1.1"}\n- {q: Second?, o: [yes, no], a: 0, ex: Second., sec: "1.2"}\n- {q: Override?, o: [yes, no], a: 0, ex: Override., sec: "1.1", pages: "153-154"}\n- {q: Default?, o: [yes, no], a: 0, ex: Default.}\n```\n');
 await build(dir);const html=await readFile(join(dir,'index.html'),'utf8');
 const data=JSON.parse(/<script type="application\/json" id="lykeion-data">([\s\S]*?)<\/script>/.exec(html)[1]);
 const qs=data.levels[0].qs;
 assert.deepEqual(qs.map(q=>q.pages),['153','154','153-154','155']);
 assert.deepEqual(qs.map(q=>q.sec),['s1-1','s1-2','s1-1','s1-3']);
});
