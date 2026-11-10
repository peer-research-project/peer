const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const out = __dirname;
const reportRoot = 'C:/Users/wbc13/.codex/worktrees/upload-report-trust/Peer/web';
const uiRoot = 'C:/Users/wbc13/.codex/worktrees/upload-global-notes/Peer/web';
const probes = [
  [reportRoot,'src/app/api/papers/report/route.ts','if (!fullAbstract(body.paper).trim())','if (false && !fullAbstract(body.paper).trim())','src/app/api/papers/report/route.test.ts','report-source-guard'],
  [reportRoot,'src/lib/papers/evidence.ts','if (entries.length === 0)','if (false && entries.length === 0)','src/lib/papers/evidence.test.ts','empty-corpus'],
  [reportRoot,'src/lib/papers/reading.ts','if (report.basis === "model-abstract" && reading.provenance.abstract === "none")','if (false && report.basis === "model-abstract" && reading.provenance.abstract === "none")','src/lib/papers/reading.test.ts','availability-source'],
  [reportRoot,'src/components/reader/use-model-report.ts','hash(JSON.stringify([paper.summaryIntro ?? "", paper.summaryResultDiscussion ?? ""]))','hash("manager mutation constant")','src/components/reader/use-model-report.test.ts','report-fingerprint'],
  [reportRoot,'src/components/reader/use-reading.ts','return (h >>> 0).toString(36);','return "manager-mutation";','src/components/reader/use-reading.test.ts','reading-fingerprint'],
  [uiRoot,'src/components/shell/masthead.tsx','href="/saved#shelf-notes"','href="/notes/new"','src/components/shell/masthead.test.tsx','global-notes-collection'],
  [uiRoot,'src/app/papers/[id]/page.tsx','!paper.id.startsWith("upload:") ? <UploadButton','false && !paper.id.startsWith("upload:") ? <UploadButton','src/app/papers/[id]/page.test.tsx','persistent-attachment'],
  [uiRoot,'src/app/saved/page.tsx','noteSearchText(note).includes(q)','false && noteSearchText(note).includes(q)','src/app/saved/page.test.tsx','notes-search'],
  [uiRoot,'src/components/briefing/upload-button.tsx','PDF upload is unavailable. Check your connection or try again later.','manager mutation missing failure explanation','src/components/briefing/upload-availability-ui.test.tsx','availability-explanation'],
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
for (const [root,file,find,replacement,test,name] of probes) {
  const target = path.join(root,file), before = fs.readFileSync(target), original = before.toString('utf8');
  if (!original.includes(find)) throw new Error('Mutation target absent: '+name);
  let result;
  try {
    fs.writeFileSync(target,original.replace(find,replacement));
    result = cp.spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run',test,'--reporter=dot'],{cwd:root,encoding:'utf8',timeout:60000});
    fs.writeFileSync(path.join(out,'mutation-'+name+'.log'),(result.stdout||'')+(result.stderr||''));
  } finally { fs.writeFileSync(target,before); }
  const restored=sha(fs.readFileSync(target))===sha(before);
  const assertion= /AssertionError/.test((result.stdout||'')+(result.stderr||''));
  const entry={name,exit:result.status,assertion,restored,sha:sha(before)};
  console.log(JSON.stringify(entry));
  if(!restored||!assertion||result.status===0)process.exitCode=1;
}
