---
name: skeptic-committee
description: Run the skeptic committee on a plan or an analysis by invoking the saved skeptic-committee workflow. Use whenever the user says "skeptic committee", "call the skeptics", "call the skeptics and their manager", "run the committee on this", or a skill tells you to run it. Never hand-author the panel, even when you remember how it goes.
---

# /skeptic-committee

Your only job is to call the saved workflow and relay what it returns.

Only a Claude Code session with saved workflows runs this. Any other agent hands the request to a
Claude Code session instead.

The committee's structure lives in one place: `.claude/workflows/skeptic-committee.js`. That script
throws when a seat set has the wrong count or repeats a seat, and its tests pin the manager's role
and each seat's lens. Nothing but this skill stops a session writing its own panel, so follow it.
Sessions that rebuilt the committee from memory got it wrong, so **do not write seat or manager
prompts yourself, and do not resize the committee to fit the task.** If the lenses are wrong for an
artifact, add a new seat set to that script, with a test, and use it.

## When not to use it

A run costs **roughly 600k subagent tokens**. That is wasted on:

- a one-line fix, a typo, a rename, or anything a single test run proves;
- a question with one factual answer (check it and answer with a confidence label instead);
- the committee's own files.

It is multi-agent orchestration, so it needs the user's explicit ask or a skill that tells you to
run it. Thinking something deserves review is not the same as being asked.

**Ask first whenever the request is at all ambiguous.** "Skeptic committee", "call the skeptics"
and "run the committee on this" are clear. "Review this", "pressure-test it", "get a second opinion"
and "have someone check it" are not. For those, ask in one line whether the user wants the
committee (roughly 600k tokens) or a single fresh-context reviewer, which is far cheaper, and wait
for the answer.

An optional guard hook (`.claude/hooks/skeptic-committee-guard.py`) blocks any Workflow script or
agent prompt that looks like a hand-written panel. If it blocks you, use this skill; do not reword
around it.

## Call it

1. Pick the seat set: `"code-plan"` for an implementation plan or a diff, `"analysis"` for a
   findings doc, a measurement or a recommendation.
2. Read the fenced block in your project's rules file (start from `examples/rules.md`) and pass it
   verbatim as `rules`. It holds your environment's hard rules, which the script deliberately does
   not contain. Pass `""` if you have none. Context about this one artifact goes as extra lines
   after the block, never edited into it.
3. Invoke by absolute file path, not by name. A file path works from any folder and always runs the
   current script; a name resolves only from the project root and serves the copy cached when the
   session started. Pass `args` as an object, never as a JSON string:

```js
Workflow({ scriptPath: "/abs/path/to/your/project/.claude/workflows/skeptic-committee.js", args: {
  artifact: "/abs/path/to/the/artifact.md",
  seat_set: "code-plan",
  rules: "<the fenced block, verbatim>",
  spec: "/abs/path/to/spec.md",
  context_pack: "/abs/path/to/your/context-pack.md",
}})
```

`spec` and `context_pack` are optional. Leave out `spec` when there is none. Pass `context_pack`
only when the artifact is about the system the pack describes (see `examples/context-pack.md`):
for anything else it is off-topic reading the reviewers are told to do first.

## If it comes back unseated

A cheap seating check runs first. If any seat has nothing concrete to attack, the result has
`seated: false`, the `empty_seats`, and no panel has run. **Bring that to the user and ask what to
do instead.** Do not rerun with a smaller committee, and do not pick a lighter check for them. A
committee that is too much for the artifact is a finding, and the user designs the replacement check.

Pass `seating: false` only when the user has seen that report and said to run it anyway.

## Report it

Relay the manager's ruling first and in full: the overall go/no-go, then the per-task or
per-claim rulings, then any seat it named for raising a false blocker. The seat reports are
supporting material. Quote a seat only where the manager backed it. Do not re-rank or soften the
ruling.

If the run throws because a seat or the manager returned nothing, start a fresh run with the same
args. Do not resume it: a resume can replay the empty result. Never present the remaining seats as
the committee.
