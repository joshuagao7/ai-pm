# Working in this repo

This is a planning board whose source of truth is a set of files. The browser UI is a *view*.
You and the human edit the same files, so you can contribute to a plan directly — no export,
no copy-paste, no separate tool holding the real state.

## The files

Per sprint, under `sprints/sprint-N/`:

| File | Role |
|---|---|
| `board.json` | **Canonical.** Cards, edges, stages, layout. Edit this directly; an open board picks up file changes within ~3 s. |
| `BOARD.md` | Generated on every save. A readable snapshot for humans, for you, and for git diffs. **Never hand-edit** — run `node board/server.mjs --regen sprints/sprint-N` if no server is running. |
| `features/<name>.md` | The detailed plan for an agreed feature. Board cards stay terse; detail lives here. |
| `inbox/` | Sources uploaded from the board that need you: messy prose, audio, transcripts. `inbox/processed/` holds ones already turned into cards. |
| `prompts/`, `results/`, `sprint-queue.json` | Written by **Execute Sprint** and by the agents that run it. See `.claude/commands/execute-sprint.md`. |

## Protocol

0. **Check `inbox/` first.** For each pending source: transcribe if it is audio (ask the user
   how, if there is no local tool), extract atomic feedback points, and append them as seed
   cards in `board.json`. Derive the card id prefix from the author's name, reusing that
   author's existing prefix and never colliding with another author's. Then move the source
   into `inbox/processed/`.
1. Read `BOARD.md` (or `board.json`) to see the current plan.
2. Edit `board.json` to contribute cards and edges. Run `--regen` afterward if no server is running.
3. When a feature is agreed, write `features/<name>.md` with the full plan and link it from the
   feature card's notes.
4. For a new sprint, run `node board/server.mjs --init`.

## Text provenance — mark what you wrote

Every card carries an `origin` that colors the words themselves in the UI. This is load-bearing:
someone reading the board must be able to tell a customer's sentence from a machine's summary of it.

| `origin` | Meaning | Renders as |
|---|---|---|
| absent / `"raw"` | Verbatim — the customer's or the user's own words | normal ink |
| `"para"` | Summarized or paraphrased from a source | purple |
| `"ai"` | AI-authored | green |

**Any card or note you author gets `"origin": "ai"`.** Points you extracted from a source get
`"para"`. Verbatim bullets keep their normal ink. Never relabel someone else's text as verbatim.

## House style for board text

Keep card text sparse — one line of intent. The board is a map, not a document; a card crowded
with your prose stops being scannable and the map stops working. Put the detail in
`features/<name>.md` and link it.
