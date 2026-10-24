#!/usr/bin/env node
/**
 * Sprint planning board — tiny local server, zero dependencies.
 *
 * Serves the board UI (index.html) and persists edits to the sprint's
 * board.json (canonical source of truth), regenerating BOARD.md (a
 * human/Claude-readable snapshot) on every save.
 *
 * Usage:
 *   node board/server.mjs                 # opens the highest-numbered sprints/sprint-N
 *   node board/server.mjs sprints/sprint-2
 *   node board/server.mjs --port 4700
 *   node board/server.mjs --regen         # rewrite BOARD.md once, exit
 *   node board/server.mjs --init          # scaffold the next sprints/sprint-N, exit
 *
 * Works under node >= 18 and bun.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const sprintsRoot = join(repoRoot, 'sprints');
const argv = process.argv.slice(2);
let port = 4680;
let dir = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') port = Number(argv[++i]);
  else if (!argv[i].startsWith('--')) dir = argv[i];
}

/* Sprint directories are `sprints/sprint-N`; default to the highest N present. */
const sprintNumbers = () =>
  (existsSync(sprintsRoot) ? readdirSync(sprintsRoot) : [])
    .map((f) => /^sprint-(\d+)$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

function latestSprintDir() {
  const ns = sprintNumbers();
  if (!ns.length) {
    console.error('No sprints found. Run `node board/server.mjs --init` to scaffold one.');
    process.exit(1);
  }
  return join(sprintsRoot, `sprint-${ns[ns.length - 1]}`);
}

/* --init: scaffold the next empty sprint and exit. Stages here are the default
   three lanes; edit `stages` in the new board.json to use different ones. */
if (argv.includes('--init')) {
  const ns = sprintNumbers();
  const n = ns.length ? ns[ns.length - 1] + 1 : 1;
  const target = join(sprintsRoot, `sprint-${n}`);
  mkdirSync(join(target, 'inbox', 'processed'), { recursive: true });
  writeFileSync(
    join(target, 'board.json'),
    JSON.stringify(
      {
        version: 1,
        sprint: `Sprint ${n}`,
        uid: 1,
        stages: [
          { id: 'comments', title: 'Raw comments', seed: true },
          { id: 'themes', title: 'Themes' },
          { id: 'prompts', title: 'Prompts', center: true },
        ],
        cards: [],
        edges: [],
      },
      null,
      1
    )
  );
  console.log(`Scaffolded sprints/sprint-${n}`);
  console.log(`Open it with:  node board/server.mjs sprints/sprint-${n}`);
  process.exit(0);
}

const sprintDir = resolve(dir || latestSprintDir());
const boardPath = join(sprintDir, 'board.json');
const mdPath = join(sprintDir, 'BOARD.md');
const inboxDir = join(sprintDir, 'inbox');
const processedDir = join(inboxDir, 'processed');

const readBoard = () => JSON.parse(readFileSync(boardPath, 'utf8'));
const boardMtime = () => statSync(boardPath).mtimeMs;

/* ---------------- BOARD.md generation ---------------- */

function toMarkdown(d) {
  const by = Object.fromEntries(d.cards.map((c) => [c.id, c]));
  const stageIdx = Object.fromEntries(d.stages.map((s, i) => [s.id, i]));
  const centerIdx = d.stages.findIndex((s) => s.center);
  const upOf = (id) => d.edges.filter((e) => e.to === id).map((e) => e.from);
  const downOf = (id) => d.edges.filter((e) => e.from === id).map((e) => e.to);
  const closure = (start, step) => {
    const seen = new Set();
    const q = [...start];
    while (q.length) {
      const id = q.shift();
      for (const n of step(id)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    return seen;
  };
  const tag = (c) => (c.author ? `${c.id} · ${c.author}` : c.id);
  const om = (c) => (c.origin === 'para' ? ' _(para)_' : c.origin === 'ai' ? ' _(ai)_' : '');
  const bullet = (c, indent = '') => {
    const lines = [`${indent}- **[${tag(c)}]** ${c.title}${om(c)}`];
    if (c.notes) for (const n of c.notes.split('\n')) if (n.trim()) lines.push(`${indent}  > ${n}`);
    return lines;
  };

  const stageCards = (sid) => d.cards.filter((c) => c.stage === sid);
  const comments = stageCards(d.stages[0].id);
  const linked = comments.filter((c) => d.edges.some((e) => e.from === c.id));
  const centerStage = d.stages[centerIdx];
  const features = stageCards(centerStage.id)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (a.y ?? 0) - (b.y ?? 0));

  const L = [];
  L.push(`# ${d.sprint} — Planning Board`);
  L.push('');
  L.push('Generated from `board.json` — edit through the board UI (`node board/server.mjs`)');
  L.push('or by editing `board.json` directly; the open board picks file edits up automatically.');
  L.push('');
  L.push(
    d.stages
      .map((s, i) => `${s.title.toLowerCase()} ${stageCards(s.id).length}`)
      .join(' · ') + ` · ${linked.length}/${comments.length} comments linked`
  );
  L.push('');

  L.push(`## ${centerStage.title}`);
  L.push('');
  const inAnyFeature = new Set();
  if (!features.length) L.push('_None yet._', '');
  for (const f of features) {
    const up = closure([f.id], upOf);
    const down = closure([f.id], downOf);
    for (const x of [...up, ...down]) inAnyFeature.add(x);
    L.push(`### ${f.rank ? `P${f.rank} — ` : ''}${f.title}${f.done ? ' ✅ SHIPPED' : ''}`);
    L.push('');
    if (f.notes) { L.push(f.notes); L.push(''); }
    for (const s of d.stages) {
      if (s.id === centerStage.id) continue;
      const pool = stageIdx[s.id] < centerIdx ? up : down;
      const cs = stageCards(s.id).filter((c) => pool.has(c.id));
      if (!cs.length) continue;
      if (s.id === d.stages[0].id) {
        L.push(`**${s.title}:** ${cs.map((c) => c.id).join(', ')}`);
        L.push('');
      } else {
        L.push(`**${s.title}:**`);
        for (const c of cs) L.push(...bullet(c));
        L.push('');
      }
    }
  }

  const orphanSections = [];
  for (const s of d.stages) {
    if (s.id === centerStage.id) continue;
    const cs = stageCards(s.id).filter((c) => !inAnyFeature.has(c.id));
    if (!cs.length) continue;
    if (s.id === d.stages[0].id) {
      orphanSections.push(`**${s.title} (${cs.length}):** ${cs.map((c) => c.id).join(', ')}`, '');
    } else {
      orphanSections.push(`**${s.title}:**`);
      for (const c of cs) orphanSections.push(...bullet(c));
      orphanSections.push('');
    }
  }
  if (orphanSections.length) {
    L.push(`## Not yet reduced into a ${centerStage.title.replace(/s$/, '').toLowerCase()}`);
    L.push('');
    L.push(...orphanSections);
  }

  L.push('## Comment index');
  L.push('');
  const authors = [...new Set(comments.map((c) => c.author))];
  for (const a of authors) {
    L.push(`### ${a}`);
    L.push('');
    for (const c of comments.filter((x) => x.author === a)) {
      const k = c.kind ? ` _(${c.kind})_` : '';
      const st = c.status ? ` — **${c.status.toUpperCase()}**` : '';
      L.push(`- **${c.id}**${k}${om(c)} ${c.title}${st}`);
    }
    L.push('');
  }
  return L.join('\n');
}

function persist(data) {
  writeFileSync(boardPath, JSON.stringify(data, null, 1));
  writeFileSync(mdPath, toMarkdown(data));
}

if (argv.includes('--regen')) {
  writeFileSync(mdPath, toMarkdown(readBoard()));
  console.log(`BOARD.md regenerated in ${sprintDir}`);
  process.exit(0);
}

/* ---------------- HTTP ---------------- */

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
};

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(here, 'index.html')));
    } else if (req.method === 'GET' && path === '/api/state') {
      json(res, 200, { mtimeMs: boardMtime(), data: readBoard() });
    } else if (req.method === 'GET' && path === '/api/mtime') {
      json(res, 200, { mtimeMs: boardMtime() });
    } else if (req.method === 'GET' && path === '/api/markdown') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(toMarkdown(readBoard()));
    } else if (req.method === 'GET' && path === '/api/inbox') {
      const list = (d) => (existsSync(d)
        ? readdirSync(d)
            .filter((f) => !f.startsWith('.') && statSync(join(d, f)).isFile())
            .map((f) => { const st = statSync(join(d, f)); return { name: f, size: st.size, mtimeMs: st.mtimeMs }; })
        : []);
      json(res, 200, { pending: list(inboxDir), processed: list(processedDir).map((x) => x.name) });
    } else if (req.method === 'POST' && path === '/api/upload') {
      let body = '';
      req.on('data', (ch) => { body += ch; if (body.length > 400e6) req.destroy(); });
      req.on('end', () => {
        try {
          const { name, base64, processed } = JSON.parse(body);
          const dir = processed ? processedDir : inboxDir;
          mkdirSync(dir, { recursive: true });
          const safe = String(name || 'upload').replace(/[/\\]/g, '_').replace(/[^\w.\- ()]/g, '').slice(-80) || 'upload';
          let target = join(dir, safe);
          let n = 1;
          while (existsSync(target)) target = join(dir, safe.replace(/(\.[^.]*)?$/, `-${n++}$1`));
          writeFileSync(target, Buffer.from(base64, 'base64'));
          json(res, 200, { ok: true, saved: target });
        } catch (e) { json(res, 400, { error: String(e.message || e) }); }
      });
    } else if (req.method === 'GET' && path === '/api/sprint') {
      const qPath = join(sprintDir, 'sprint-queue.json');
      if (!existsSync(qPath)) { json(res, 200, { queue: null }); }
      else {
        const q = JSON.parse(readFileSync(qPath, 'utf8'));
        const rdir = join(sprintDir, 'results');
        const rfiles = existsSync(rdir) ? readdirSync(rdir) : [];
        const agents = (q.prompts || []).map((p) => {
          const nn = (p.file || '').split('/').pop().split('-')[0];
          const logPath = join(rdir, `${nn}-progress.log`);
          let lines = [], lastMs = 0;
          if (existsSync(logPath)) {
            const all = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
            lines = all.slice(-4);
            lastMs = statSync(logPath).mtimeMs;
          }
          const report = rfiles.find((f) => f.startsWith(nn + '-') && f.endsWith('.md')) || null;
          return { nn, id: p.id, rank: p.rank, title: p.title, lines, lastMs, report };
        });
        json(res, 200, { queue: q, agents });
      }
    } else if (req.method === 'GET' && path === '/api/result') {
      const nn = String(new URL(req.url, 'http://localhost').searchParams.get('p') || '').replace(/[^0-9]/g, '');
      const rdir = join(sprintDir, 'results');
      const f = nn && existsSync(rdir) ? readdirSync(rdir).find((x) => x.startsWith(nn + '-') && x.endsWith('.md')) : null;
      if (!f) return json(res, 404, { error: 'no report yet' });
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(rdir, f)));
    } else if (req.method === 'POST' && path === '/api/execute') {
      req.on('data', () => {});
      req.on('end', () => {
        try {
          const d = readBoard();
          /* Execute turns the center lane into work; its themes are the lane just upstream. */
          const ci = d.stages.findIndex((s) => s.center);
          const pi = ci >= 0 ? ci : d.stages.length - 1;
          const promptStage = d.stages[pi];
          const themesSid = d.stages[Math.max(1, pi - 1)] && d.stages[Math.max(1, pi - 1)].id;
          const seedSid = d.stages[0].id;
          const by = Object.fromEntries(d.cards.map((c) => [c.id, c]));
          const upOf = (id) => d.edges.filter((e) => e.to === id).map((e) => e.from);
          const prompts = d.cards
            .filter((c) => c.stage === promptStage.id && !c.done &&
              (((c.notes || '').trim()) || (c.title && c.title !== 'Untitled')))
            .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
          const pdir = join(sprintDir, 'prompts');
          mkdirSync(pdir, { recursive: true });
          const rdir = join(sprintDir, 'results');
          const resultFiles = existsSync(rdir) ? readdirSync(rdir).filter((f) => f.endsWith('.md')) : [];
          const fmtComment = (c) =>
            `- (${c.id} · ${c.author || '?'}${c.status ? ' · ' + c.status : ''}${c.origin ? ' · ' + c.origin : ''}) ${c.title}`;
          const queue = [];
          prompts.forEach((p, i) => {
            const seen = new Set();
            const q = [p.id];
            while (q.length) {
              const id = q.shift();
              for (const u of upOf(id)) if (!seen.has(u)) { seen.add(u); q.push(u); }
            }
            const themes = d.cards.filter((c) => c.stage === themesSid && seen.has(c.id));
            const L = [`# Sprint prompt ${i + 1}: ${p.title}`, ''];
            if ((p.notes || '').trim()) L.push(p.notes.trim(), '');
            const fus = (p.followUps || []).map((f) => (f.text || '').trim()).filter(Boolean);
            if (fus.length) {
              const slugGuess = (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
              const prior = resultFiles.filter((f) => slugGuess.length > 3 && f.includes(slugGuess.slice(0, 12)));
              L.push('## FOLLOW-UPS — the base prompt above was ALREADY DELIVERED; address only these refinements', '');
              fus.forEach((t, k) => L.push(`${k + 1}. ${t}`));
              L.push('');
              L.push(prior.length
                ? `Prior delivery report(s) for context: ${prior.map((f) => `results/${f}`).join(', ')}`
                : 'Prior delivery: see this sprint\'s results/ (match by title) for what was already built.');
              L.push('');
            }
            L.push('## Evidence — connected themes and their raw customer comments', '');
            for (const t of themes) {
              L.push(`### Theme: ${t.title}`);
              if ((t.notes || '').trim()) L.push(t.notes.trim());
              for (const cid of upOf(t.id)) {
                const c = by[cid];
                if (c && c.stage === seedSid) L.push(fmtComment(c));
              }
              L.push('');
            }
            const direct = d.cards.filter((c) => c.stage === seedSid && seen.has(c.id) &&
              !themes.some((t) => d.edges.some((e) => e.from === c.id && e.to === t.id)));
            if (direct.length) {
              L.push('### Directly connected comments');
              direct.forEach((c) => L.push(fmtComment(c)));
              L.push('');
            }
            const slug = (p.title || 'prompt').toLowerCase().replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '').slice(0, 40) || 'prompt';
            const file = `${String(i + 1).padStart(2, '0')}-${slug}.md`;
            writeFileSync(join(pdir, file), L.join('\n'));
            queue.push({
              rank: p.rank ?? i + 1,
              id: p.id,
              title: p.title,
              file: `prompts/${file}`,
              followUps: (p.followUps || []).filter((f) => (f.text || '').trim()).length || undefined,
            });
          });
          writeFileSync(join(sprintDir, 'sprint-queue.json'),
            JSON.stringify({ queuedAtMs: Date.now(), sprint: d.sprint, status: 'queued', prompts: queue }, null, 1));
          json(res, 200, { queued: queue.length });
        } catch (e) { json(res, 500, { error: String(e.message || e) }); }
      });
    } else if (req.method === 'POST' && path === '/api/state') {
      let body = '';
      req.on('data', (ch) => { body += ch; if (body.length > 4e6) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data.cards) || !Array.isArray(data.edges) || !Array.isArray(data.stages)) {
            return json(res, 400, { error: 'malformed board' });
          }
          persist(data);
          json(res, 200, { ok: true, mtimeMs: boardMtime() });
        } catch (e) {
          json(res, 400, { error: String(e.message || e) });
        }
      });
    } else {
      json(res, 404, { error: 'not found' });
    }
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AI PM  →  http://localhost:${port}`);
  console.log(`Source of truth: ${boardPath}`);
});
