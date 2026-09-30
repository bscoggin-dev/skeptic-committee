#!/usr/bin/env python3
"""PreToolUse hook: block hand-written review panels, so the skeptic committee only ever runs
through its saved workflow.

Written after sessions rebuilt the committee from memory and got its structure wrong.
The saved workflow (`.claude/workflows/skeptic-committee.js`, next to this hook's folder) enforces
the structure; this hook stops a session from going around it.

Register it as a PreToolUse hook on Workflow, Agent and Task in `.claude/settings.json` (see README).

Allowed: the canonical script path, the name `skeptic-committee`, any other named workflow, a
byte-identical copy of the canonical script (the runtime's per-run copy), and anything carrying the
marker `committee-guard: test-copy` (scripts) or `committee-guard: allow` (agent prompts).
Blocked (exit 2, reason on stderr): an inline or file Workflow script, or an Agent/Task prompt,
that reads like a committee panel.

It pattern-matches, so a reworded panel can slip past it. It fails OPEN: any error allows the call,
because a broken guard must never stop every Workflow and Agent call.
"""
import json
import re
import sys
from pathlib import Path

CANON = Path(__file__).resolve().parent.parent / 'workflows' / 'skeptic-committee.js'

BLOCK = f"""Blocked by the skeptic-committee guard: this looks like a hand-written review panel.
Run the committee only through the skeptic-committee skill, which calls
Workflow({{scriptPath: "{CANON}", args: {{...}}}}).
If the user's request was at all ambiguous about wanting the committee, ask the user first: it
costs roughly 600k tokens, and a single fresh-context reviewer is the cheaper option.
A deliberate test copy may carry the comment `committee-guard: test-copy` (scripts) or
`committee-guard: allow` (agent prompts)."""

SEAT_PROMPT = re.compile(
    r'skeptic[\s-]+committee|\bseat\s+\d+\s+of\s+\d+|\bone\s+seat\b|adversarial\s+(review\s+)?panel', re.I)


def looks_like_committee_script(text):
    t = text.lower()
    return (('skeptic' in t or 'committee' in t)
            and ('seat' in t or 'panel' in t)
            and 'manager' in t)


def workflow_blocked(tool_input):
    if tool_input.get('name') and not tool_input.get('script') and not tool_input.get('scriptPath'):
        return False  # saved workflows by name, including skeptic-committee itself
    path = tool_input.get('scriptPath')
    if path:
        p = Path(path).expanduser()
        if p.resolve() == CANON.resolve():
            return False
        text = p.read_text()
        if CANON.exists() and text == CANON.read_text():
            return False
    else:
        text = tool_input.get('script') or ''
    if 'committee-guard: test-copy' in text:
        return False
    return looks_like_committee_script(text)


def agent_blocked(tool_input):
    prompt = tool_input.get('prompt') or ''
    if 'committee-guard: allow' in prompt:
        return False
    if SEAT_PROMPT.search(prompt):
        return True
    t = prompt.lower()
    return 'manager' in t and 'panel' in t and ('finding' in t or 'rule' in t)


def main():
    try:
        event = json.load(sys.stdin)
        tool = event.get('tool_name')
        tool_input = event.get('tool_input') or {}
        if tool == 'Workflow':
            blocked = workflow_blocked(tool_input)
        elif tool in ('Agent', 'Task'):
            blocked = agent_blocked(tool_input)
        else:
            blocked = False
    except Exception:
        return 0
    if blocked:
        print(BLOCK, file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
