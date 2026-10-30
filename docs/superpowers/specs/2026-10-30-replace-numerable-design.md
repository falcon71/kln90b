# Replace numerable with our own formatters (#447): design

Date: 2026-10-30. Issue: #447 (enhancement). Branch: `447-replace-numerable`.

A small change: one `fixes #447` commit with the new module, its unit test, the rewritten call sites, the dependency
removal and the doc changes (CLAUDE.md, `docs/architecture.md`).

## Intent

`numerable` has not been updated in six years, and the unit uses only a sliver of it: `format(value, pattern)` with
zero-padded integer and fixed-decimal patterns, plus a few signed ones. The maintainer wants the dependency gone and
replaced with a handwritten formatter for exactly what the unit uses. This is **not a port**: nothing of numerable's
pattern language, locale handling, `zeroFormat`/`signedZero` options or NaN/null/Infinity handling is carried over.
A side goal is speed: `format` is called from display ticks at 4 Hz, and numerable resolves options, parses the pattern
and assembles a mask on every call.

## Goals, non-goals, anti-goals

- Goal: the same output as today for every value the unit actually passes (the maintainer, 2026-10-30). Edge
  behavior on values that never occur (NaN, null, Infinity, a forced `+` on a value that rounds to zero but is not
  zero) need not match.
- Goal: proven faster. A throwaway benchmark is built **before** any code change from the patterns and value ranges the
  call sites use and run against numerable; after the change the same mix is run against the new functions and the
  two results are compared. The benchmark is not committed (the maintainer, 2026-10-30).
- Goal: call sites get simpler where they can. Sites that already round and range-check before formatting (for
  example `SpeedDisplay`, `RoundedDistanceDisplay`, `format(rounded, "0")`) drop the formatter where a plain
  `String()`/`padStart` says the same; null/NaN guards that exist in the callers stay where they are.
- Non-goal: no change of what any page shows or what the persistence writes. The V1/V2 user waypoint strings must stay
  byte-identical for real inputs (public contract, CLAUDE.md).
- Anti-goal: a mini pattern language of our own. A `format("000.0")` replacement that parses patterns would be half a
  port.

## Approaches

- **B. A few purpose-built functions (chosen by the maintainer).** No pattern parsing; each call site says what it
  means; the functions are small enough to test exhaustively.
- A. Our own `format(value, pattern)` with a pattern cache. Rejected: keeps a pattern language alive, still branches on
  the pattern per call, and gives no natural place to fold in the callers' pre-rounding.
- C. Formatter objects precompiled per pattern. Rejected: no faster than B and more ceremony.

## Decided

- New module `kln90b/data/NumberFormat.ts` with two functions:
    - `padInt(value, digits)`: rounds to the nearest integer, halves away from zero, and pads the magnitude with
      leading zeros to `digits`. A negative result gets a `-` in front of the padded digits (`-5` → `-05` for 2
      digits, the `-00` temperature form); a negative value that rounds to 0 shows no sign. A value wider than
      `digits` is not cut (`1234` → `1234` for 3 digits).
    - `padFixed(value, intDigits, decimals)`: the same with `decimals` places after the point (`0.25` → `0.25`,
      `9.96` → `10.0` for 1/1).
- Rounding scales the magnitude by 10^decimals, nudges it up by two units in the last place
  (`* (1 + 2 * Number.EPSILON)`) and uses `Math.round`, so halves go away from zero and a decimal half that binary
  cannot hold rounds up as in numerable (`1.005` → `1.01`). The first draft rounded the binary value (`1.005` →
  `1.00`) on the argument that no real input sits on such a half; the APT 4 comm frequencies disprove it: on 25 kHz
  and 8.33 kHz channels 144 of the 3799 values from 118.000 to 136.990 MHz (for example 128.075) would show one
  hundredth lower. The nudged rounding matched numerable on about a million values (that grid, every hundredth and
  tenth up to 99.99/999.9, and random values of each pattern), checked 2026-10-30.
- Signs for the persistence records (`UserWaypointPersistor`) and the APT 2 time zone are written by those callers:
  `+` or `-` by the sign of the raw value, then the magnitude; where numerable truncated (`rounding: "truncate"`) the
  caller truncates with `Math.trunc` first. A latitude of −0.4° keeps its `-00` (today's `signedZero`).
- One persisted form changes on purpose (my call, 2026-10-30): a user VOR's magnetic variation of exactly 0 was written
  as `00` (numerable drops the forced `+` on zero without `zeroFormat`) and is now `+00`, the width of every other
  variation. It is the record's last field and both V1 and V2 loaders read it with `Number()`, so old and new data,
  and an older version reading new data, all load 0.
- The fieldsets that split a value into digit cells keep doing so on the new functions' output.
- #448 (an angle below 0.05° on CAL 4 / NAV 4 breaks the digit edits, because numerable drops the forced sign of a
  value that rounds to zero) is fixed first, in its own `fixes #448` commit on numerable, as the maintainer decided on
  2026-10-30. The #447 rewrite of `VnavAngleFieldset` then changes no behavior.
- `numerable` is removed from `package.json` and `package-lock.json`. CLAUDE.md (Conventions) and
  `docs/architecture.md` name the new functions instead. The dated plans in `docs/superpowers/plans/` stay as they
  are.
- A committed unit test `test/unit/data/NumberFormat.test.ts` pins both functions with literal expectations,
  including negatives, halves, carries (`9.96`), and values wider than the padding. The existing waypoint persistence
  tests hold the record format.
- A throwaway differential check, run before numerable is uninstalled, compares old and new output for every call
  site's realistic value range; it is not committed.

## Left to the builder

- Exact names and JSDoc of the two functions, and whether a third helper earns its place once all call sites are
  rewritten.
- The benchmark's mechanics (plain Node script in the session scratchpad, iteration counts, warm-up), as long as the
  same value mix runs before and after and per-call times are reported for both.
- How each call site is simplified, within the rule that its output for real values does not change.
