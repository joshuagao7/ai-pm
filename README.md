# AI PM

*Interviews → code.*

A local, file-backed planning canvas that carries a customer's own words all the way to the
commit that answers them.

Raw feedback goes in on the left. It converges into themes. Each theme feeds a **prompt** — the
development brief for one feature — which gets ranked, then handed to a coding agent along with
the evidence it came from. What ships is testable against the sentence that asked for it.

The browser is a *view*. The repo files are the truth, so a human editing visually and an agent
editing directly are working on the same plan at the same time.

```sh
node board/server.mjs --init    # scaffold sprints/sprint-1
node board/server.mjs           # open it → http://localhost:4680
```

No dependencies, no build, no account. Node ≥ 18 (or bun) and a browser.

---

## Why this shape

Most product tooling loses the thread at every handoff. A customer says something on a call;
it becomes a line in a CRM; someone writes a ticket that paraphrases the line; someone writes a
spec that paraphrases the ticket; an engineer reads the spec. By the time code is written, the
original sentence is four translations away and nobody can check the result against it.

Here the chain stays intact and stays visible:

- **Nothing is retyped.** A raw comment card is the customer's actual words. It connects to a
  theme, which connects to a prompt. Click any card to light up everything upstream and
  downstream of it — you can always ask *why are we building this* and get names and sentences back.
- **Paraphrase is marked as paraphrase.** Card text is colored by origin: verbatim, summarized,
  or AI-authored. You can see at a glance how far a given line has drifted from a person.
- **The brief carries its own evidence.** When you execute a sprint, each prompt is bundled with
  its themes and their raw comments into one file. The agent doing the work reads who asked and
  in what words — not a lossy summary of it.
- **The plan lives in git, beside the code.** `BOARD.md` regenerates on every save, so a sprint's
  reasoning diffs and reviews like source.

The board is continuously live: new feedback keeps arriving on the left while shipped features
retire on the right. It is not a document you rewrite each sprint.

---

## The loop

**1. Get feedback in.** The **Upload** button opens a panel — name the author, then paste or type
raw notes; each line or bullet becomes a card, with a checklist preview before adding. Or drop a
file: text loads into the textarea, while audio, binaries, and messy prose you would rather not
hand-split go to `inbox/` via **Send to inbox for Claude**. Each new author automatically gets
their own color.

**2. Let the agent do the intake.** An agent working in this repo reads `inbox/`, transcribes
audio, extracts atomic feedback points, adds them as cards marked as paraphrase, and files the
source under `inbox/processed/`. See [`CLAUDE.md`](CLAUDE.md).

**3. Converge comments into themes.** Connect cards three ways: drag a card's right-edge port
onto any later-lane card (drop on empty lane space to create a connected card there); *click* the
port so the line follows your cursor, then click the target; or select card A and **shift-click**
card B in a later lane. Select several same-lane cards to fan connectors in from all of them.

Double-tap **`c`** for **smart clustering**: green dashed lines suggest a theme for each unlinked
comment, by word overlap with theme titles and their members. Click a suggestion once to arm it,
again to save it. Suggestions are never saved without both clicks.

**4. Tag by Kano — decide what payoff you are buying.** Hover a comment and five buttons appear;
or select cards and press `1`–`5` (`0` clears).

| Tag | Meaning | Why it matters |
|---|---|---|
| **Basic** | Expected — absence enrages | Mandatory, earns zero praise |
| **Performance** | More is linearly better | Reliable, incremental returns |
| **Delighter** | Unexpected — differentiates | Where you actually win |
| **Indifferent** | Nobody would notice | Skip candidate |
| **R&D** | Worth doing, needs research | Longer horizon |

The distinction that saves sprints: fixing a Basic is mandatory *and* wins you nothing, so a
roadmap made only of Basics feels like work and reads like stagnation.

**5. Write the prompts and rank them.** Each center-lane card is the brief for one feature,
written by typing into its notes — or by voice, which is typing by other means: with the cursor
in any text field, **hold Space and speak**; transcription streams into the field at the caret,
release to finish. A quick tap of Space still types a normal space. Outside a field, hold-Space
appends to the selected card's notes.

Every prompt carries a `P#` badge — its execution order. Reorder with the ▲▼ arrows or drag the
card vertically. Position otherwise follows connections: each prompt sits beside the themes it
draws from.

**6. Execute.** The red **Execute Sprint** button bundles every unshipped prompt with its upstream
evidence into `prompts/NN-slug.md` and writes `sprint-queue.json`. In Claude Code, run
[`/execute-sprint`](.claude/commands/execute-sprint.md): it spawns one implementation agent per
prompt, each in an isolated worktree with the bundle as context, tasked to build the feature and
verify it. Progress streams back into the board's agent panel; each agent leaves a delivery report
in `results/`.

**7. Green-flag what actually works.** After testing a delivered feature by hand, click **⚑**. The
card turns green, strikes through, and hides; a "⚑ shipped n" chip in the header reveals the
shipped pile. Execute Sprint always skips green-flagged prompts, so re-running it only queues
unfinished work.

This step stays human on purpose. Shipped is a judgment made against the running product, not a
status an agent may award itself.

**8. Refine without losing the thread.** Each prompt card has a **↻ follow-up** button that appends
a numbered refinement field. Adding a follow-up *reopens* a shipped card. On the next Execute
Sprint the prompt re-bundles with a "FOLLOW-UPS — already delivered, address only these" section
plus a pointer to the prior delivery report, and the agent is scoped to just the refinements.

---

## Files

Per sprint, under `sprints/sprint-N/`:

| File | Role |
|---|---|
| `board.json` | **Canonical.** Cards, edges, stages, layout. Agents edit this directly; an open board picks up changes within ~3 s. |
| `BOARD.md` | Generated on every save — readable snapshot for humans, agents, and git diffs. Never hand-edit. |
| `features/<name>.md` | The detailed plan for an agreed feature. Cards stay terse; detail lives here. |
| `inbox/` | Uploaded sources awaiting an agent. `inbox/processed/` holds ones already turned into cards. |
| `prompts/` | Prompt bundles written by Execute Sprint. |
| `results/` | `NN-progress.log` (tailed live by the board) and `NN-slug.md` delivery reports. |
| `sprint-queue.json` | The queue `/execute-sprint` consumes. |

Lanes are defined by `stages` in `board.json`. The default three — Raw comments → Themes →
Prompts — are a starting point, not a constraint: add a lane, rename one, or move the center.
The center lane is whichever stage carries `"center": true`, and that is the lane Execute Sprint
turns into work.

`inbox/` is gitignored, since it tends to hold recordings and customer documents. Everything else
is meant to be committed — the plan sitting in version control next to the code is the point.

## Canvas controls

- **Navigate:** drag the background to pan; pinch or ⌘-scroll to zoom; two-finger scroll pans;
  **Fit** zooms to the whole map.
- **Layout is automatic.** Every lane is vertically centered on a shared midline; themes sort by
  connection count, prompts by rank, downstream lanes follow upstream order. Manual vertical drag
  is disabled in auto-sorted lanes.
- **Sort (`s`)** — comments into tag bands (untagged → Basic → Performance → Delighter → R&D →
  Indifferent, link-grouped within a band), themes by inbound connections, downstream lanes by
  upstream order. **Cluster (`c`)** — every lane grouped by shared ties to the next column,
  computed right-to-left; ungrouped cards sink to the bottom. Cards stay put while you work;
  sorting happens on demand in one animated pass. Rank changes apply immediately.
- **Move across lanes:** drag any created card left or right; the target lane highlights. Raw
  comments are locked to lane 1. Connectors that would point backwards are pruned automatically.
- **Lineage:** click a card to light up everything upstream and downstream. `Esc` clears.
- **Edit:** double-click a title (created cards only); `＋ notes` for longer text; hover ✕ to
  delete any card — undoable with ⌘Z. Click a connector then its ✕ (or `Delete`) to remove it.
- **Provenance:** the dot on a created card cycles its origin — verbatim (normal ink), paraphrase
  (purple), AI-authored (green).

## CLI

```sh
node board/server.mjs                      # highest-numbered sprints/sprint-N
node board/server.mjs sprints/sprint-2     # a specific sprint
node board/server.mjs --port 4700
node board/server.mjs --init               # scaffold the next sprint, exit
node board/server.mjs --regen              # rewrite BOARD.md from board.json, exit
```

The server binds to `127.0.0.1` and has no auth — it is a local tool for local files.

## License

MIT — see [LICENSE](LICENSE).
