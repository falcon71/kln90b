# A SID or STAR replaced by one of the same length (#445): design

Date: 2026-10-30. Issue: #445 (bug). Branch: `fix-445-same-length-procedure`.

A small change: one `fixes #445` commit with the code, its tests and the doc changes (CLAUDE.md).

## Intent

When the active SID is replaced by one with the same number of legs while the aircraft flies from its last fix to the
first en-route waypoint, the active waypoint stays at its index. `ActiveWaypoint.assertToMatchesFplIdx`
(`kln90b/data/flightplan/ActiveWaypoint.ts`) then returns at its first instance check and never looks at the leg in
front of the active waypoint. The FROM stays the old SID's last fix, a fix no longer in FPL 0, and DTK, XTK and roll
steering follow a leg that is gone until the next sequencing. A STAR replaced in front of the first approach fix takes
the same path (`Apt7Page.loadNow` inserts the STAR before the approach, so the approach keeps its legs).

A replacement of a different length already moves the active waypoint to another index. It reaches the #440 rules
(`docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md`, section 3.3), finds the FROM gone and activates the
closest leg, as the KLN 89 trainer does when the FROM is deleted (check 3e, 2026-10-28).

## Goals, non-goals, anti-goals

- Goal: a same-length replacement behaves exactly like a replacement of a different length (the maintainer,
  2026-10-30): the same code path, so the closest leg is activated and the turn state is cleared, the run-out of an
  abeam turn included (`activateFpl0`).
- Non-goal: no new rule for a replaced FROM. Keeping the active waypoint and only rebuilding the FROM from the new
  procedure's last fix was considered and declined: it would make the result depend on the procedure's length.
- Non-goal: the #440 rules, the #408 check of the following leg, and MOVE ? (`onArcEntryMoved`) are unchanged.
- Anti-goal: a Direct To must not be disturbed. It flies from its own origin (`fromPlanLeg` is null), so a change of
  the leg in front of its target is not a change of its FROM.

## Constraints

- `assertToMatchesFplIdx` runs on every `getActiveLeg`, `getActiveWpt` and `getActiveFplIdx`, several times in every
  1 Hz calculation tick and in display ticks. The added check is one array read and one instance comparison, so it costs
  nothing measurable (CLAUDE.md, tick cost).
- Only a batch edit can cause the case (a procedure load, the EFB loader, the #148 deletes from the front). Through the
  pages, a waypoint is inserted or deleted one at a time and each edit moves the active index.

## Approaches

- **A. Extend the early check (chosen).** The first instance check returns early only if the leg in front of the
  active waypoint is still `fromPlanLeg`. A Direct To never passes it, since its `fromPlanLeg` is null, and goes on to
  the Direct To branch right below, which finds its target at the same index and does what the early return did; the
  cost is one `indexOf` over FPL 0 per read while a Direct To is active, which is nothing. (A `|| this.isDirectTo` in
  the condition would save that, but no test could hold a clause that changes no behavior, so it is left out.) Without
  a Direct To the check falls through into the existing #440 code, which finds the active waypoint at the same index:
  the FROM is not its neighbor, so if the old FROM is two legs in front (one leg in between, after a batch that also
  deleted a leg further up) the inserted-leg rule applies, and otherwise the closest leg is activated. Same-length and
  different-length replacements share the code.
- B. Re-activate FPL 0 in the callers (`Apt7Page.loadNow` and the other procedure loads). Rejected: it spreads the rule
  over the pages and misses the EFB loader and the #148 front deletes, and it leaves the class's instance checks
  incomplete.
- C. A version counter on FPL 0, re-checked on every edit. Rejected: larger than the bug, and it would also react to
  edits further down the plan, which the instance checks deliberately ignore (#408).

## Decided

- Only the condition of the first early return in `assertToMatchesFplIdx` changes; the comment there names #445.
- The #445 pin in `test/unit/data/flightplan/ActiveWaypoint.test.ts` loses its `.fails`, and its comment changes from a
  pin to a regression test. Its sibling keeps holding the preconditions.
- New unit tests in the same file: a STAR replaced by one of the same length in front of the first approach fix; a Direct
  To to a plan waypoint whose leg in front is replaced keeps its FROM and its target; the turn state is cleared after a
  same-length replacement, as `activateFpl0` does for a different length.
- `test/README.md` names the #445 pin as the current example of `it.fails`. It is the only pin in the suite, so the
  paragraph goes back to saying the suite may hold none at a given time, and cites the #445 pin as one from the
  history, as it does the #440 pin.

## Left to the builder

- The exact tests' geometry, and whether the turn-state test is a separate test or an assertion in the regression test.
- The pin must be proved by mutation after the fix: reverting the condition must turn the regression test red.
