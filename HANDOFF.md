# Handoff notes

Start with [`README.md`](README.md) for what the tool is and how to use it, and
[`CLAUDE.md`](CLAUDE.md) for the protocol an agent follows when it works in this repo. This file
is the engineer's map: where things live, how the pieces talk, and what is known to be rough.

## Where it came from

The board was built inside a product repo to run real sprints from customer interviews, then
cut out into a generic tool: customer data and named authors were removed, sprint folders became
`sprints/sprint-N`, and `--init` scaffolding was added. The write-up is at
[joshua-gao.com/ai-pm](https://joshua-gao.com/ai-pm). This repo starts fresh, with no history,
because the old history mixed board changes with customer material.

## Run it

```sh
node board/server.mjs            # opens the highest-numbered sprints/sprint-N on :4680
node board/server.mjs --init     # scaffold the next sprint
```

No dependencies and no build. Node ≥ 18. Edit `board/index.html` and reload the browser. Edit
`board/server.mjs` and restart the server.

## Architecture

Two files do everything.

**`board/server.mjs`**: a plain `node:http` server bound to `127.0.0.1`, with no auth. It
resolves one sprint directory at startup and serves:

| Route | Does |
|---|---|
| `GET /` | serves `board/index.html` |
| `GET /api/state` · `POST /api/state` | read / replace `board.json` (whole document); every write also regenerates `BOARD.md` (`toMarkdown`) |
| `GET /api/mtime` | `board.json` mtime, polled by the UI to pick up outside edits |
| `GET /api/markdown` | the `BOARD.md` text (Export panel) |
| `GET /api/inbox` · `POST /api/upload` | list / write files in `inbox/` (base64 body) |
| `POST /api/execute` | bundles each unshipped center-lane prompt with its upstream themes and comments into `prompts/NN-slug.md`, writes `sprint-queue.json` |
| `GET /api/sprint` · `GET /api/result?p=NN` | tails `results/NN-progress.log` for the live agent panel / serves a delivery report |

**`board/index.html`**: the whole UI, vanilla JS, no framework. It is long but sectioned with
`/* ---- name ---- */` banners, in this order: constants → state & sync → undo/redo →
pan/zoom → lane headers → mutations → ranking → **auto-layout** (the largest and most delicate
part) → rendering → smart clustering → selection → pointer (drag/connect) → editing → keyboard
→ toolbar → upload → voice (Web Speech API) → execute → agent monitor.

**`.claude/commands/execute-sprint.md`**: the `/execute-sprint` command. It reads
`sprint-queue.json` and starts one worktree-isolated Claude Code agent per prompt. Each agent
must write `results/NN-progress.log` and `results/NN-<slug>.md`, because those are the exact
paths the board tails. If you rename them, change the server too.

### Data model (`board.json`)

`stages[]` defines the lanes. The one with `"seed": true` holds raw comments, and the one with
`"center": true` is what Execute turns into work. `cards[]` carry `id`, `stage`, `title`,
`author`, `origin` (`raw`/`para`/`ai`), `status` (the Kano tag: `basic`/`perf`/`delight`/
`indiff`/`rnd`, see `STATUS` in `index.html`), `rank`, `notes`, `followUps`, and `done` (the
human ⚑ green flag). `edges[]` are `{from, to}` and always point to a later lane. `uid` is the
id counter. There is no formal schema. `toMarkdown` in the server and the render code in the UI
are the readers to update if you change the format.

## Known gaps

- **Saves are last-write-wins.** The UI posts the whole board about 700 ms after an edit. If an
  agent edits `board.json` while the browser has unsaved changes, the browser's save overwrites
  the agent's edit. Outside edits are only pulled in while the UI is idle. A version check on
  `POST /api/state` (reject if the mtime moved) would close this.
- **No tests.** Verification so far has been by hand in the browser. The server has no
  dependencies, so `node --test` against the routes would be cheap to add.
- **Voice dictation** depends on the browser's Web Speech API (Chrome and Safari work, Firefox
  does not).
- **One sprint per server process.** To switch sprints, restart the server with a different
  path.
- **Local only, by design.** There is no auth. Don't bind it to a public interface as it is.

## Ideas that came up but are not built

- Shared or hosted boards for a team (needs auth plus the conflict check above).
- A real intake pipeline for `inbox/`. Today an agent handles it by following `CLAUDE.md`.
