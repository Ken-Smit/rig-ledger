// Runnable checks for the expense domain rules. Run with `npm run check`.
//
// ponytail: plain asserts via node, no test framework — the Client has no test
// runner and one tax-path rule does not justify installing one. Swap to vitest
// if the suite grows past a handful of these.
import assert from 'node:assert'
import { FUEL_TYPE, slugifyCategory, labelForType, validateFuelEntry } from '../src/types/expense'

// The scan returns a lowercase slug; Receipts renders it as a human label; the
// modal re-slugs that label to decide whether to show Gallons/State. If this
// round-trip breaks, the fuel fields silently stop appearing.
assert.strictEqual(labelForType(slugifyCategory('fuel')), 'Fuel')
assert.strictEqual(slugifyCategory(labelForType(slugifyCategory('fuel'))), FUEL_TYPE)
for (const typed of ['Fuel', 'fuel', 'FUEL', '  Fuel  ']) {
  assert.strictEqual(slugifyCategory(typed), FUEL_TYPE, `typed: ${typed}`)
}
for (const other of ['meals', 'maintenance', 'tolls', 'repairs']) {
  assert.notStrictEqual(slugifyCategory(other), FUEL_TYPE, `non-fuel: ${other}`)
}

// Blank gallons: an ordinary fuel expense, nothing to file.
assert.strictEqual(validateFuelEntry('', 'TN'), null)
assert.strictEqual(validateFuelEntry('   ', ''), null)

// Gallons + state: files.
assert.deepStrictEqual(validateFuelEntry('84.312', 'TN'), { entry: { gallons: 84.312, jurisdiction: 'TN' } })

// Gallons with no state — a receipt whose address was unreadable. Must block:
// guessing the state would file tax against the wrong jurisdiction.
const noState = validateFuelEntry('62.5', '')
assert.ok(noState?.error?.includes('state'))
assert.strictEqual(noState?.entry, undefined)

// Unusable gallons never file.
for (const bad of ['0', '-5', 'abc']) {
  const r = validateFuelEntry(bad, 'TN')
  assert.ok(r?.error, `must reject ${bad}`)
  assert.strictEqual(r?.entry, undefined, `must not file ${bad}`)
}

console.log('expense checks passed')
