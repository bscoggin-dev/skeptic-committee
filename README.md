# Skeptic committee

An adversarial review committee for Claude Code. You give it a plan or an analysis, and five
reviewers attack it at the same time, each through one lens, without seeing each other's work. A
manager who was not on the panel then reads the original, forms its own view, rules on every
serious finding, looks for what all five missed, and makes one go or no-go call.

It is a Claude Code saved workflow plus a skill that calls it, with an optional hook that stops a
session from hand-building its own version.

## Why it exists

LLMs lean positive. Ask one whether a plan is sound and it will usually tell you it is. A single
reviewer helps, but it has a bias of its own, since it wants to look useful, and it will sometimes
raise a problem that isn't really there. The committee is built to catch both kinds of error.

**Five seats, each with one lens.** A reviewer asked to check everything checks the easy things.
Giving each seat a single job means someone is always looking at the test quality, or the premise,
or whether the work is worth doing at all. There are two seat sets:

| Seat set | For | Lenses |
|---|---|---|
| `code-plan` | an implementation plan or a diff | correctness, semantics, data, test quality, value |
| `analysis` | a findings doc, a measurement or a recommendation | inference, data integrity, method, premise, value |

**Blind and parallel.** The seats cannot see each other, so one confident seat cannot pull the
others toward its view, and five seats agreeing means something.

**An adversarial manager, not a summarizer.** A manager that just summarizes the panel inherits its
mistakes. This one is told it is independent of the panel and its antagonist. It reads the artifact
itself first, then treats the seat reports as claims to verify, not findings to pass along. Every
serious finding gets ruled upheld, overstated or refuted, with the check behind the ruling, and a
seat that raised a false blocker gets named.

**A seating check first.** Before any real spend, one cheap agent checks that every seat has
something concrete to attack. If one does not, no panel runs and you are told which seat was empty.
The committee never quietly shrinks to fit.

**The structure lives in code.** The workflow throws if a seat set does not have exactly five
distinct seats, and the tests pin each seat's lens and the manager's role. This happened because
when the structure was only written down as instructions, Claude rebuilt the committee from memory
and got it wrong, twice in one day.

## What it costs

A run costs roughly **600K tokens** across its agents. Save it for decisions that are expensive to
undo. For a typo, a rename, or anything one test run proves, it is a waste, and for an ordinary
second opinion a single fresh-context reviewer is far cheaper. The skill tells Claude to ask before
running it whenever the request is ambiguous.

## Requirements

- [Claude Code](https://claude.com/claude-code) with saved workflows (the `Workflow` tool, which
  runs scripts from `.claude/workflows/`). The committee does not run in other agents.
- Node 18 or later, to run the tests.
- Python 3, only if you use the guard hook.

## Install

Copy the `.claude` folder into your project (or merge it into the one you have):

```
.claude/workflows/skeptic-committee.js        the committee
.claude/workflows/skeptic-committee.test.mjs  offline tests, no agents spawned
.claude/skills/skeptic-committee/SKILL.md     how Claude calls it
.claude/hooks/skeptic-committee-guard.py      optional guard
examples/rules.md                             example environment rules
examples/context-pack.md                      example context pack
```

Then:

1. Copy `examples/rules.md` somewhere in your project and replace the fenced block with your own
   hard rules: files a reviewer must never read, how to run tests safely, what is read-only, who the
   operator is. The script contains no environment rules on purpose. They arrive as an input.
2. Optionally write a context pack like `examples/context-pack.md`: dated, checked facts about your
   system, so the seats don't spend their budget rediscovering your schema.
3. Edit the path in the skill's `Workflow({ scriptPath: ... })` example to your project's absolute
   path, and the rules-file path in step 2 of "Call it".
4. Run the tests: `node --test .claude/workflows/skeptic-committee.test.mjs`

To turn on the guard, add this to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Workflow|Agent|Task",
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/skeptic-committee-guard.py" }
        ]
      }
    ]
  }
}
```

The guard pattern-matches, so a reworded panel can slip past it, and it fails open on any error so
it can never block every Workflow and Agent call.

## Use

Ask Claude to "run the skeptic committee on" a file. The skill picks the seat set, passes your
rules, and calls the workflow. Called directly, it looks like this:

```js
Workflow({ scriptPath: "/abs/path/to/.claude/workflows/skeptic-committee.js", args: {
  artifact: "/abs/path/to/plan.md",   // required
  seat_set: "code-plan",              // required: "code-plan" or "analysis"
  rules: "<your rules block>",        // required, "" if none
  spec: "/abs/path/to/spec.md",       // optional
  context_pack: "/abs/path/to/pack.md", // optional
}})
```

It returns `{ seated: true, seat_set, seats, manager }`, where `manager` is the ruling in prose,
or `{ seated: false, empty_seats, message }` when the seating check found a seat with nothing to
attack. To add a lens set, add it to `SEAT_SETS` in the script with exactly five distinct seats and
add a test.

## Credit

The push to write this up came from Mo Bitar's channel Less Bitter, in particular
["Opus 5.5 is disturbing"](https://youtu.be/dyEpDobnkmA) and
["I talked to 50 people building with AI. It's a mess"](https://youtu.be/jDG7L5HuBnk). His advice
to solo builders is to keep things simple and drop big multi-agent setups. This is the one I kept,
and he says in the video that "skepticism should be the default stance," which is what the
committee is for.

## License

MIT. See [LICENSE](LICENSE).
