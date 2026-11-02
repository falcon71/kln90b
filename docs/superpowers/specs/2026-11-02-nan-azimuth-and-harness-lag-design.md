# NaN satellite azimuth (#456) and the harness position lag (#457) — design

Date: 2026-11-02. Size: two small changes, one commit each. Approaches chosen by the maintainer in the session.

## #456: drop a satellite whose angles are not finite

**Intent.** The SDK's `GPSSatellite.applyProjection` takes `acos` of a dot product that can round past ±1 for a
satellite exactly due north or south of the aircraft, which gives a NaN azimuth. One NaN row makes `computeGeometry`
return an invalid solution, and the unit goes through TRAN for one SDK update (5 s). Estimated at one occurrence per
50,000 to 300,000 flight hours (issue comment).

**What gets built.** `Gps.updateSolution` and `predictRaim` (`kln90b/GpsSolution.ts`) leave out a satellite whose
`[zenith, azimuth]` is not finite, as if it were not in use. Leaving it out there, and not inside `computeGeometry`,
keeps the PRN list and the error-model coefficients row-aligned. The solution is computed from the remaining
satellites.

**Approaches.** Drop the satellite (chosen) or repair the azimuth to 0 or π from the satellite's Cartesian position.
The repair is more realistic, but the event is very rare and a pilot would not notice one satellite missing for 5 s, so
the maintainer chose the simpler drop.

**Non-goals.** No change to `computeGeometry`, STA 1 (it shows only the elevation, which stays finite) or the SDK.
Reporting the `acos` rounding upstream is left to the maintainer.

**Test.** A unit test that makes `computeGeometry`'s caller see a satellite with a NaN azimuth plus enough good ones,
and expects a valid solution from the others; the same for `predictRaim` if a fake prediction context makes it cheap.

## #457: the harness integrates the aircraft up to the time of a read

**Intent.** In the flight harness the physics loop writes the position every 62 ms, while `E:ABSOLUTE TIME` is exact,
so a calculation tick reads a position up to one physics step old (up to 3.8 m at 120 kt). That puts a floor under the
meter-level bounds of the simulated-receiver tests (#402).

**What gets built (approach A).**
- `FakeSim` gets an optional hook that runs before a SimVar read.
- `Flight` installs one that, when the clock has moved since the last integration, steps the aircraft from there to
  `Date.now()` with the current bank and writes its state. A guard stops reads during that step from recursing.
- The 16 Hz loop stays, so the pilot's bank command still updates at 16 Hz; it uses the same catch-up.
- `jump` and `teleport` keep working: they reset the integration time as they do now.

**Approaches.** A (chosen): catch up on any read, so every reader sees the position of its sim time. B: catch up only
before the calculation tick; exact for that tick alone, and tied to the unit's tick internals. C: report the last
physics time as `E:ABSOLUTE TIME`; the time between ticks would then jitter by ±62 ms, a new error.

**Tests.**
- The `it.fails` pin in `test/flight/harness/flight.test.ts` becomes a plain test; the control "is at most one physics
  step old" and its "the pin below needs the lag" assertion go.
- The no-jump bound in `test/flight/flights/simulatedGps.test.ts` tightens from 5 m toward the issue's 2 m. The new
  value is measured after the fix (with a margin) and recorded in the comment; the #457 notes in that file's comments
  go.
- The whole suite must stay green; any other bound the lag had loosened is left as it is unless a test fails.

**Left to the builder.** The hook's exact shape and name, and where in `FakeSim`'s read paths it is called (every path
that returns a stored SimVar value).
