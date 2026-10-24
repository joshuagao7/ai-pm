---
description: Pick up the queued sprint prompts and run one implementation agent per prompt.
---

Run the queue that the board's **Execute Sprint** button wrote.

## 1. Read the queue

Find the active sprint directory (default: the highest-numbered `sprints/sprint-N`, or the
one named in `$ARGUMENTS`). Read `sprint-queue.json` there. It looks like:

```json
{ "queuedAtMs": 0, "sprint": "Sprint 1", "status": "queued",
  "prompts": [ { "rank": 1, "id": "p3", "title": "...", "file": "prompts/01-slug.md", "followUps": 2 } ] }
```

If the file is missing, tell the user to click **Execute Sprint** on the board first, and stop.

Read every prompt bundle listed in `prompts[].file`. Each bundle already carries its own
evidence: the feature intent, then the themes it came from, then the verbatim customer
comments under those themes. That evidence is the point — an agent building from a bundle
can see *who asked for this and in what words*, so do not strip it when you pass work along.

## 2. Fan out — one agent per prompt

Spawn one implementation agent per queued prompt, all in the same message so they run
concurrently. Give each agent `isolation: "worktree"` so parallel edits cannot collide.

Each agent's brief must contain:

- the full text of its prompt bundle (not a summary — the verbatim customer language matters)
- the two files it owns, using the **two-digit prefix `NN` from its prompt filename**:
  - `sprints/sprint-N/results/NN-progress.log` — append one short line per meaningful step.
    The board tails the last 4 lines of this file into its live agent panel, so write it as
    you go, not at the end.
  - `sprints/sprint-N/results/NN-<slug>.md` — the delivery report, written when done.
    The board links this from the card once it exists.
- the instruction to implement the feature **and verify it** — run the project's tests, and
  exercise the actual change however this repo is normally exercised. A report claiming
  success without having run anything is a failed task.
- the instruction that the report must state plainly what was built, what was verified and
  how, and anything deliberately left undone.

If a prompt bundle has a `FOLLOW-UPS` section, the base feature already shipped. That agent
addresses **only** the listed refinements and reads the prior delivery report named in the
bundle before touching anything.

## 3. Report back

When the agents finish, give the user one compact table: rank, title, what shipped, what was
verified, and any failures — plus the path to each delivery report. Say plainly which prompts
failed or were only partly done; do not smooth that over.

Then remind the user of the loop's last step, which is theirs and not yours: they test each
delivered feature by hand and click **⚑** on the card to green-flag it. Green-flagged cards
are skipped by the next Execute Sprint, so the board only ever queues unfinished work.

Do not green-flag cards yourself, and do not edit `board.json` to mark work done — shipped is
a human judgment made against the running product.
