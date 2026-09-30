// Offline tests for the skeptic-committee workflow. Runs the script inside an
// AsyncFunction with stubbed agent/parallel, so no agents are spawned.
// Run: node --test .claude/workflows/skeptic-committee.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(join(HERE, 'skeptic-committee.js'), 'utf8')
const AsyncFunction = (async () => {}).constructor

const ARGS = {
  artifact: '/tmp/artifact.md',
  rules: 'RULE-SENTINEL: never touch the widget',
  seat_set: 'code-plan',
}

const CODE_PLAN = ['correctness', 'semantics', 'data', 'test-quality', 'value']
const ANALYSIS = ['inference', 'data-integrity', 'method', 'premise', 'value']

function report(label) {
  return {
    seat: label, verdict: 'SOUND', recommendation: 'PROCEED_AS_WRITTEN',
    findings: [{ severity: 'MATERIAL', locus: 'Task 1', objection: `objection from ${label}`,
      evidence: 'e', fix: 'f', confidence: 'verified' }],
    survived: [],
  }
}

// The seating agent's report: every seat named in the schema's enum has material.
function fullSeating(opts) {
  const keys = opts.schema.properties.seats.items.properties.key.enum
  return { seats: keys.map((key) => ({ key, has_material: true, material: `material for ${key}` })) }
}

async function run(args, { source = SOURCE, calls = [], seatResult = report, seatingResult = fullSeating, managerResult = 'MANAGER RULING' } = {}) {
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, ...opts })
    if (opts.phase === 'Seating') return seatingResult(opts)
    return opts.phase === 'Panel' ? seatResult(opts.label) : managerResult
  }
  // Mirrors the runtime: a thunk that throws resolves to null.
  const parallel = (thunks) => Promise.all(thunks.map(async (t) => { try { return await t() } catch { return null } }))
  const body = source.replace(/^export const meta/m, 'const meta')
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', body)
  return fn(agent, parallel, undefined, () => {}, () => {}, args, { total: null })
}

const byPhase = (calls, phase) => calls.filter((c) => c.phase === phase)

// ─── The committee ───

for (const [seat_set, keys] of [['code-plan', CODE_PLAN], ['analysis', ANALYSIS]]) {
  test(`${seat_set}: seating, then five seats, then one manager`, async () => {
    const calls = []
    const out = await run({ ...ARGS, seat_set }, { calls })
    assert.deepEqual(calls.map((c) => c.phase),
      ['Seating', 'Panel', 'Panel', 'Panel', 'Panel', 'Panel', 'Manager'])
    assert.deepEqual(byPhase(calls, 'Panel').map((c) => c.label), keys.map((k) => `seat:${k}`))
    assert.ok(byPhase(calls, 'Panel').every((c) => c.schema), 'every seat returns structured JSON')
    assert.equal(byPhase(calls, 'Manager')[0].schema, undefined, 'the manager returns prose')
    assert.equal(out.seated, true)
    assert.equal(out.seat_set, seat_set)
    assert.deepEqual(out.seats.map((s) => s.seat), keys)
    assert.equal(out.manager, 'MANAGER RULING')
  })
}

test('the manager receives every seat report as labelled JSON data', async () => {
  const calls = []
  const out = await run(ARGS, { calls })
  const manager = byPhase(calls, 'Manager')[0].prompt
  const json = JSON.stringify(out.seats, null, 2)
  assert.ok(manager.includes(json), 'the exact JSON of all five reports is in the prompt')
  assert.ok(manager.includes(`not findings you inherit.\n${json}`), 'the claims label sits immediately before the data')
  for (const r of out.seats) assert.ok(manager.includes(r.findings[0].objection))
})

test('the manager prompt carries its adversarial role and every ruling', async () => {
  const calls = []
  await run(ARGS, { calls })
  const manager = byPhase(calls, 'Manager')[0].prompt
  for (const must of [constant('MANAGER_ROLE'), ...constant('RULINGS'), 'your job is NOT to synthesize', 'ATTACK THE PANEL', 'every MINOR finding']) {
    assert.ok(manager.includes(must), `manager prompt lacks "${must}"`)
  }
})

for (const seat_set of ['code-plan', 'analysis']) {
  test(`${seat_set}: each seat gets its own lens and none of the others`, async () => {
    const calls = []
    await run({ ...ARGS, seat_set }, { calls })
    const seats = seatObjects()[seat_set]
    for (const [i, c] of byPhase(calls, 'Panel').entries()) {
      assert.ok(c.prompt.includes(seats[i].lens), `${c.label} lacks its lens`)
      for (const [j, other] of seats.entries()) {
        if (j !== i) assert.ok(!c.prompt.includes(other.lens), `${c.label} carries ${other.key}'s lens`)
      }
    }
  })
}

test('every seat and the manager get the read-only rule and the author warning', async () => {
  const calls = []
  await run(ARGS, { calls })
  for (const c of calls.filter((c) => c.phase !== 'Seating')) {
    assert.ok(c.prompt.includes('You are read-only'), `${c.label} lacks the read-only rule`)
    assert.ok(c.prompt.includes('AUTHOR HAS A STAKE'), `${c.label} lacks the author warning`)
  }
})

// ─── The contract ───

test('a seat set cut to four throws before any agent runs', async () => {
  const four = SOURCE.replace(/^[ \t]*\{ key: 'test-quality'.*\n/m, '')
  assert.notEqual(four, SOURCE, 'the mutation must actually remove a seat')
  const calls = []
  await assert.rejects(run(ARGS, { source: four, calls }), /"code-plan" has 4 seats/)
  assert.equal(calls.length, 0)
})

test('a NON-selected seat set cut to four still throws', async () => {
  const four = SOURCE.replace(/^[ \t]*\{ key: 'inference'.*\n/m, '')
  assert.notEqual(four, SOURCE)
  await assert.rejects(run({ ...ARGS, seat_set: 'code-plan' }, { source: four }), /"analysis" has 4 seats/)
})

test('a seat set that repeats a lens throws before any agent runs', async () => {
  const dup = SOURCE.replace("{ key: 'semantics', lens: LENS.semantics }", "{ key: 'semantics', lens: LENS.correctness }")
  assert.notEqual(dup, SOURCE)
  const calls = []
  await assert.rejects(run(ARGS, { source: dup, calls }), /"code-plan" repeats a seat/)
  assert.equal(calls.length, 0)
})

test('a seat set that repeats a seat name throws before any agent runs', async () => {
  const dup = SOURCE.replace("{ key: 'semantics', lens: LENS.semantics }", "{ key: 'correctness', lens: LENS.semantics }")
  assert.notEqual(dup, SOURCE)
  await assert.rejects(run(ARGS, { source: dup }), /"code-plan" repeats a seat/)
})

test('failure messages send the caller to a fresh run, never a resume', () => {
  assert.doesNotMatch(SOURCE, /resume the run/i)
  assert.match(SOURCE, /start a fresh run with the same args/i)
})

test('a seat that returns nothing stops the run before the manager', async () => {
  const calls = []
  const seatResult = (label) => (label === 'seat:data' ? null : report(label))
  await assert.rejects(run(ARGS, { calls, seatResult }), /seat\(s\) data returned nothing/)
  assert.equal(byPhase(calls, 'Manager').length, 0)
})

// ─── The seating gate ───

test('an empty seat stops the run before the panel and names the seat', async () => {
  const calls = []
  const seatingResult = (opts) => {
    const r = fullSeating(opts)
    r.seats.find((s) => s.key === 'test-quality').has_material = false
    return r
  }
  const out = await run(ARGS, { calls, seatingResult })
  assert.equal(out.seated, false)
  assert.deepEqual(out.empty_seats, ['test-quality'])
  assert.match(out.message, /ask/i)
  assert.equal(byPhase(calls, 'Panel').length, 0)
  assert.equal(byPhase(calls, 'Manager').length, 0)
})

test('a seat the seating report leaves out counts as empty', async () => {
  const calls = []
  const seatingResult = (opts) => {
    const r = fullSeating(opts)
    r.seats = r.seats.filter((s) => s.key !== 'value')
    return r
  }
  const out = await run(ARGS, { calls, seatingResult })
  assert.equal(out.seated, false)
  assert.deepEqual(out.empty_seats, ['value'])
  assert.equal(byPhase(calls, 'Panel').length, 0)
})

test('the seating agent is told every lens and constrained to the seat keys', async () => {
  const calls = []
  await run({ ...ARGS, seat_set: 'analysis' }, { calls })
  const seating = byPhase(calls, 'Seating')[0]
  assert.deepEqual(seating.schema.properties.seats.items.properties.key.enum, ANALYSIS)
  for (const k of ANALYSIS) assert.ok(seating.prompt.includes(k.toUpperCase()), `lens ${k} missing`)
  assert.ok(seating.prompt.includes('/tmp/artifact.md'))
  assert.ok(seating.prompt.includes('RULE-SENTINEL'))
})

test('seating: false skips the gate', async () => {
  const calls = []
  const out = await run({ ...ARGS, seating: false }, { calls })
  assert.equal(byPhase(calls, 'Seating').length, 0)
  assert.equal(byPhase(calls, 'Panel').length, 5)
  assert.equal(out.seated, true)
})

test('a seating agent that returns nothing throws rather than seating blind', async () => {
  const calls = []
  await assert.rejects(run(ARGS, { calls, seatingResult: () => null }), /seating/)
  assert.equal(byPhase(calls, 'Panel').length, 0)
})

test('a manager that returns nothing throws rather than passing the seats off as the ruling', async () => {
  await assert.rejects(run(ARGS, { managerResult: null }), /manager returned nothing/)
})

for (const order of ['empty first', 'empty last']) {
  test(`a seat reported both with and without material stays empty (${order})`, async () => {
    const calls = []
    const seatingResult = (opts) => {
      const r = fullSeating(opts)
      const contradiction = { key: 'value', has_material: false, material: 'nothing' }
      r.seats = order === 'empty first' ? [contradiction, ...r.seats] : [...r.seats, contradiction]
      return r
    }
    const out = await run(ARGS, { calls, seatingResult })
    assert.equal(out.seated, false)
    assert.deepEqual(out.empty_seats, ['value'])
    assert.equal(byPhase(calls, 'Panel').length, 0)
  })
}

test('a seating report with no seat list throws a named error', async () => {
  const calls = []
  await assert.rejects(run(ARGS, { calls, seatingResult: () => ({}) }), /seating check returned no seat list/)
  assert.equal(byPhase(calls, 'Panel').length, 0)
})

// ─── Inputs ───

test('bad args fail with a message naming the field', async () => {
  await assert.rejects(run(undefined), /args\.artifact/)
  await assert.rejects(run('{"artifact":"x"}'), /args\.artifact/)
  await assert.rejects(run({ ...ARGS, rules: undefined }), /args\.rules/)
  await assert.rejects(run({ ...ARGS, seat_set: 'vibes' }), /code-plan, analysis/)
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    await assert.rejects(run({ ...ARGS, seat_set: inherited }), /must be one of code-plan, analysis/, inherited)
  }
})

test('rules, spec and context pack reach every agent', async () => {
  const calls = []
  await run({ ...ARGS, spec: '/tmp/spec.md', context_pack: '/tmp/pack.md' }, { calls })
  assert.equal(calls.length, 7)
  for (const c of calls) {
    for (const s of ['RULE-SENTINEL', '/tmp/artifact.md', '/tmp/spec.md', '/tmp/pack.md']) {
      assert.ok(c.prompt.includes(s), `${c.label} is missing ${s}`)
    }
  }
})

test('optional inputs leave no dangling lines when omitted', async () => {
  const calls = []
  await run(ARGS, { calls })
  for (const c of calls) {
    assert.doesNotMatch(c.prompt, /CONTEXT PACK:/)
    assert.doesNotMatch(c.prompt, /SPEC:/)
    assert.doesNotMatch(c.prompt, /undefined/)
  }
})

// ─── The skill: one source of truth ───
// Everything structural is read OUT of the script, so these tests follow the script when it
// changes. The skill may point at the script; it may not restate what the script decides.

const SKILL_PATH = join(HERE, '..', 'skills', 'skeptic-committee', 'SKILL.md')
const readSkill = () => readFileSync(SKILL_PATH, 'utf8')

const constant = (name) => {
  const m = SOURCE.match(new RegExp(`^const ${name} = (.+)$`, 'm'))
  assert.ok(m, `script no longer declares ${name}`)
  return Function(`return (${m[1]})`)()
}
// The script's real SEAT_SETS, evaluated from its own source (LENS + SEAT_SETS), not parsed.
const seatObjects = (source = SOURCE) => {
  const from = source.indexOf('const LENS = {')
  const to = source.indexOf('// ─── The contract.')
  assert.ok(from !== -1 && to > from, 'script no longer declares LENS then SEAT_SETS before the contract')
  return Function(`${source.slice(from, to)}; return SEAT_SETS`)()
}
const seatSets = (source = SOURCE) =>
  Object.fromEntries(Object.entries(seatObjects(source)).map(([name, seats]) => [name, seats.map((s) => s.key)]))
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// Returns every way `text` restates the structure. Empty means clean.
function restatements(text) {
  const found = []
  const lower = text.toLowerCase()
  const n = constant('SEAT_COUNT')
  const nums = [n, NUMBER_WORDS[n], n + 1, NUMBER_WORDS[n + 1]].join('|')
  const nouns = 'seats?|panel|agents?|reviewers?|committee|lens(?:es)?|adversarial'
  const count = new RegExp(`\\b(${nums})\\b[^.\\n]{0,40}\\b(${nouns})\\b|\\b(${nouns})\\b[^.\\n]{0,40}\\b(${nums})\\b`, 'i')
  if (count.test(text)) found.push(`seat or agent count: "${text.match(count)[0]}"`)
  for (const word of constant('RULINGS')) if (lower.includes(word.toLowerCase())) found.push(`ruling ${word}`)
  for (const sentence of [constant('MANAGER_ROLE'), ...constant('CLAIMS_LABEL').split('. ')]) {
    const phrase = sentence.replace(/\.$/, '').toLowerCase()
    if (lower.includes(phrase)) found.push(`phrase "${phrase}"`)
  }
  if (/antagonist/i.test(text)) found.push('antagonist')
  if (/labell?ed as claims|reports? as (json )?data/i.test(text)) found.push('panel-as-data label')
  for (const [name, keys] of Object.entries(seatSets())) {
    const named = keys.filter((k) => new RegExp(`\\b${k.replace(/-/g, '[\\s-]')}\\b`, 'i').test(text))
    if (named.length >= 3) found.push(`${named.length} lenses of "${name}": ${named.join(', ')}`)
  }
  return found
}

test('the skill restates none of the structure', () => {
  assert.deepEqual(restatements(readSkill()), [])
})

// Proof the checker bites: each line restates the structure in a different way, and each
// must be caught when appended to the real skill. Paraphrase in general cannot be caught.
for (const line of [
  'The committee has five adversarial seats.',
  'Seats: 5.',
  'The committee is a panel of five, plus a manager.',
  'Six agents run in total.',
  'The manager rules each finding upheld, overstated or refuted.',
  'The manager is its ultimate antagonist.',
  'The seats are correctness, semantics and test quality.',
  'Lenses: inference, data integrity, method.',
  'The manager gets the panel reports as data, labelled as claims, not instructions.',
  'These are claims made by reviewers with an incentive to look rigorous.',
]) {
  test(`the checker catches: ${line}`, () => {
    assert.notDeepEqual(restatements(`${readSkill()}\n${line}\n`), [], `not caught: ${line}`)
  })
}

test('the skill invokes the saved workflow with only inputs the script reads', () => {
  const skill = readSkill()
  assert.match(skill, /^name: skeptic-committee$/m)
  const call = skill.match(/Workflow\(\{\s*scriptPath:\s*"([^"]+)",\s*args:\s*\{([\s\S]*?)\}\s*\}\)/)
  assert.ok(call, 'skill has no Workflow({ scriptPath: "...", args: {...} }) call')
  assert.ok(call[1].startsWith('/') && call[1].endsWith('/.claude/workflows/skeptic-committee.js'), 'skill points at a different script')
  const passed = [...call[2].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
  const read = new Set([...SOURCE.matchAll(/\bA\.([a-z_]+)/g)].map((m) => m[1]))
  const required = [...SOURCE.matchAll(/Error\(['`]skeptic-committee: args\.([a-z_]+)/g)].map((m) => m[1])
  assert.deepEqual(required, ['artifact', 'rules', 'seat_set'], 'required-input parser is out of step with the script')
  for (const k of passed) assert.ok(read.has(k), `skill passes "${k}", which the script never reads`)
  for (const k of required) assert.ok(passed.includes(k), `skill omits required input "${k}"`)
  for (const set of Object.keys(seatSets())) assert.ok(skill.includes(`"${set}"`), `skill does not offer seat set "${set}"`)
})

test('the skill says what a run costs and when not to use it', () => {
  const skill = readSkill()
  assert.match(skill, /600k/)
  assert.match(skill, /when not to use/i)
})

test('the script does not assume who wrote the artifact', () => {
  assert.doesNotMatch(SOURCE, /author is an agent/i)
  assert.doesNotMatch(SOURCE, /\bagent under review\b/i)
})

test('the seat-set helper follows the script when a set is added', () => {
  const extra = SOURCE.replace("  analysis: [", "  extra: [\n" + "    { key: 'x', lens: 'x' },\n".repeat(5) + "  ],\n  analysis: [")
  assert.deepEqual(Object.keys(seatSets(extra)), ['code-plan', 'extra', 'analysis'])
  assert.deepEqual(seatSets(extra).extra, ['x', 'x', 'x', 'x', 'x'])
})

test('the skill scopes the context pack to the system it describes', () => {
  const skill = readSkill()
  assert.match(skill, /Pass `context_pack`\s+only when the artifact is about the system the pack describes/)
})

test('the script body carries no environment-specific rules or paths', () => {
  for (const s of ['/Users/', '/home/', 'C:\\']) {
    assert.ok(!SOURCE.includes(s), `script body contains "${s}"`)
  }
  // No line of the example rules block may be baked into the script: rules arrive through args.
  const rules = readFileSync(join(HERE, '..', '..', 'examples', 'rules.md'), 'utf8')
  const block = rules.match(/```text\n([\s\S]*?)```/)
  assert.ok(block, 'examples/rules.md has no fenced text block')
  for (const line of block[1].split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean)) {
    assert.ok(!SOURCE.includes(line), `script body contains the rule "${line}"`)
  }
})
