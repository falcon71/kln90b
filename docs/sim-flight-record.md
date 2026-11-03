# Sim flight record

A dated record of the test flights in MSFS 2024: how the unit's outputs are flown by real aircraft and their autopilots.
It is the evidence behind the aircraft profiles in `test/harness/flight/pilots.ts` (`AIRCRAFT_PROFILES`) and the bands of
`test/flight/flights/aircraftTurns.test.ts`. Each block is true on its date: a new flight adds a block, and an old block is
not edited. The maintainer flies; the flights are prepared in code so that the pilot only takes off and engages the
autopilot. The KLN 89 trainer checks are in [kln89-trainer-record.md](kln89-trainer-record.md).

## How a flight is prepared

- **A temporary setup module**, `kln90b/TestFlightSetup.ts`, called from `KLN90BCore` right after `propsReady`, with every
  touched line marked `// TEST FLIGHT`. It is never committed: each flight is a complete `git diff` kept outside the repo,
  applied with `git apply`, built into the community folder (`buildTargetDir`) and reverted with `git apply -R` at once,
  so that the tree is clean again before the flight. A headless run in the flight stage checks the build first.
- **What it does:** it turns on fast acquisition and `L:KLN90B_WriteGpsSimvars`, approves the self-test and acknowledges
  the data base page, forces the acquisition, and at the first fix builds FPL 0 from temporary waypoints laid out from the
  position and true heading at that moment, with a Direct To the first. It logs one row per calculation into a ring buffer
  that the page returns as a JSON string (`window.turnLog(start, count)`), read with the `sim-debugger` skill
  (`simdbg.mjs eval`) in chunks of about 100 rows (20 KB). The rows hold the true position, bank, heading, track, speeds
  and wind, the autopilot's state, the GPS SimVars as read back, and the unit's internals the question needs.
- **What the pilot does:** load a fresh flight lined up on the runway before power-on (the route is built once per
  instrument load), GPS as the nav source, LEG mode, no EFB flight plan; take off, engage the autopilot in NAV, hold the
  speed steady; leave the sim running afterwards, because the log lives in the instrument's memory.
- **Traps found:**
  - Coherent GT has no `globalThis` (a `ReferenceError` on the unit's error page, 2026-11-02). The headless run under Node
    does not catch it: use `window`, and search the built bundle for `globalThis` before a build is flown.
  - The error page keeps its text in the DOM after OK: `document.querySelector('.errormessage').innerHTML` through
    `simdbg.mjs eval`.
  - The sim time runs on in active and full pause, and the unit keeps ticking, so the log stays readable in a pause.
  - The sim ignores the unit of a write to the GPS SimVars and takes the value in the SimVar's own unit (2026-11-03): a
    distance written in nautical miles lands as meters, a magnetic variation in degrees as radians (−416°). A debugger
    write uses the unit `SensorsOut` uses. A value read back in the same evaluation as its write is still the old one;
    read it in a later evaluation. `GPS WP NEXT ID` and `GPS WP PREV ID` read back empty although the unit writes them.
- **Adding an aircraft:** fly the route of the 2026-11-02 block with it, fit the constants of `simNavAutopilot` to the
  turns (or write a pilot of its own when its autopilot works differently), check the fit against a second flight that
  the fit did not see, and add a profile to `AIRCRAFT_PROFILES` and its bands to `MEASURED` in `aircraftTurns.test.ts`.

**2026-11-01 and 2026-11-02** (the #402 flights 1 to 3: Black Square Turbine Duke, default autopilot NAV, KTTS runway at
28.632 N, 80.706 W, heading 150; FPL 0 TF1 2 NM ahead, TF2 3.5 NM after a 90° right turn, TF3 3 NM after a 90° left
turn; read again from their logs on 2026-11-02)
- Flight 1 accelerated from 163 to 207 kt during the turn at TF1 and ended about 455 m outside the next leg: the turn was
  planned for the ground speed at its start.
- Flights 2 and 3 at 115 to 135 kt ended about 250 to 320 m inside the next leg at both turns, and then closed on it with
  about 1° of bank for about 50 s. Flight 2 flew on four and then three satellites, and flight 3 had every simulated GPS
  error ×20, but the turns looked alike.

**2026-11-02** (the turn debug flights A, B and C: the Duke as above; KTTS, heading 150 for A and B, 330 for C; FPL 0 TF1
2 NM ahead, then TF2 3.5 NM after 90° right, TF3 3.5 NM after 90° left, TF4 2.5 NM after 90° right; 125 to 131 kt, wind
2 kt, about 1000 ft; question: why does the unit seem to start its turns too early, so that the Duke undershoots?)
- **A, the unit as it is.** Every turn started within one calculation of its turn point, the lead r·tan(θ/2) plus the
  roll-in (0.66 to 0.70 NM + 0.13 to 0.15 NM), on a planned bank of 19° to 20° and a radius of 0.66 to 0.70 NM. The
  autopilot started to bank 2 to 3 s after the DTK switch, rolled at about 4°/s and banked 26.8° to 27.2°, above its own
  `AUTOPILOT MAX BANK` of 25, which flew a radius of 0.48 to 0.51 NM. It held that bank while it was more than 200 m
  inside the turn circle, where the roll steering command (`L:KLN90B_RollCommand`, not flown by the Duke) fell to 0°.
  Rollout 221, 267 and 314 m inside the next leg, at most 311 to 411 m inside 21 s after the switch, under 30 m 43 to
  53 s after it, then 39 to 69 m outside; it closed on the leg at a track 9.4° to 10.2° off the course with about 1° of
  bank.
- **B, the roll-in removed**, the turn starting at the lead as in the KLN 89 trainer. Same autopilot behavior (3 s, 27°).
  Rollout 67, 15 and 34 m inside, at most 100 to 155 m inside, under 30 m 25 to 38 s after the switch, then 20 to 79 m
  outside.
- **C, `GPS WP TRACK ANGLE ERROR` against the turn path** (the inbound leg during the roll-in, then the circle's course
  0, 5 and 10 s ahead at TF1, TF2 and TF3), the DTK unchanged. The sim did not keep the value: read back in the same
  second it was the DTK less the track in every row of every turn (−89.6° at a switch where the unit wrote +0.6°). The
  turns flew as in A: rollout 205, 317 and 289 m inside. The sim computes the two SimVars from each other; commit
  00863639 had already found that `GPS WP DESIRED TRACK` comes out wrong unless it is written after
  `GPS WP TRACK ANGLE ERROR`.
- **Why the Duke undershoots:** its autopilot banks 7° to 8° steeper than the planned standard-rate turn and does not
  correct on the cross track during the turn. The roll-in moves the turn start about 260 m earlier at 130 kt and is the
  rest of it. The lead itself is the trainer's. A kinematic model of a 90° turn (start point, bank, reaction delay, roll
  rate; open loop) reproduced A within about 40 m and predicted B (about 0 m). Its rollout, inside negative:

  | Ground speed | Duke, with roll-in | Duke, without | Standard-rate autopilot, with | Standard-rate autopilot, without |
  |--------------|--------------------|---------------|-------------------------------|----------------------------------|
  | 130 kt       | −261 m             | +3 m          | +40 m                         | +305 m                           |
  | 160 kt       | −137 m             | +255 m        | +30 m                         | +423 m                           |
  | 180 kt       | −103 m             | +360 m        | +28 m                         | +491 m                           |

  So B is good by coincidence: the Duke's late roll-in (outward) and its steep bank (inward) cancel at 130 kt, and above
  about 165 kt, where the planned bank reaches its 25° limit, the model has the Duke overshoot without the roll-in (not
  flown). In the model an autopilot that flies the planned bank ends about 30 to 40 m outside with the roll-in and about
  300 m outside without it; the trainer's own aircraft, which turned at about standard rate 4 to 7 s after the DTK
  switch, overshot its anticipated turns (kln89-trainer-record.md, 2026-10-19). So the roll-in does the job it was added
  for (users reported overshoots before it); no aircraft with such an autopilot was flown on this date.
- **The maintainer's decision:** the turn start and the outputs stay as they are, and user feedback decides whether
  anything follows. Rejected: removing the roll-in (right for the Duke at 130 kt only); `GPS WP TRACK ANGLE ERROR` along
  the turn (the sim overwrites it, flight C); `GPS WP DESIRED TRACK` along the turn (user facing, and a wrong value of it
  was already noticed by an aircraft developer).
- **The Duke's model** (`TURBINE_DUKE`, `simNavAutopilot`): a course to the DTK plus an intercept angle of 200°/NM of
  cross track up to 15°, a bank of 1° per degree of track error to it up to 27°, a reaction delay of 2 s, a command lag
  of 1 s, a roll rate of 4°/s. Fitted to the turns of A, flown in the harness with legs of 5 NM after TF1 so that the
  model starts every turn established, as the Duke did: rollout 251 to 253 m inside, at most 354 to 358 m 21 s after the
  switch, under 30 m 45 s after it, then 56 m outside, closing at 10.8°. Against B, which the fit did not see: rollout
  73 to 77 m inside (B 15 to 67), at most 135 to 137 m (B 100 to 155), under 30 m after 48 s (B 25 to 38), then 66 to 67 m
  outside (B 20 to 79). It gets the effect of the roll-in, but is about 35 m too far inside without it and converges more
  slowly than the Duke.

**2026-11-03** (the zeroing test of `docs/failures.md` for #458, and the bisection of the hot-swap crash, #462: Black
Square Turbine Duke, KTTS, its hot swap to a Garmin GNS; a throwaway build whose console fails an output port, which
writes the null state of its outputs once, the GPS SimVars included, and then drops every write; single SimVars written
through the debugger)
- **On the ground, flight 1.** Each port failed in turn: about 1 s later every SimVar of the port read 0 and stayed 0;
  the repair brought the live values back within a few seconds. The approach lamps showed nothing, being 0 en route.
  With `L:KLN90B_WriteGpsSimvars` off, failing every port wrote no GPS SimVar: `GPS OVERRIDDEN` was 0 and the sim's own
  GPS filled them (ETA 64171 s, course to steer 5.8). The null state of the old commented-out list in
  `SensorsOut.reset`, written through every port at the instrument load and again at a power cycle with every port
  failed, held through the self-test. No crash.
- **The sim derives values from what the unit writes.** A DTK of 0 read back as 352.7°, 0 less the sim's own variation
  of −7.3°, and the bearings likewise. With `GPS IS ACTIVE WAY POINT` false the sim reported `GPS WP DISTANCE` 0 although
  that SimVar's port still worked.
- **In flight, flight 1** (about 130 kt, 1000 ft, the default autopilot in NAV on GPS): the ARINC 429 nav data failed
  for 30 s (DTK, distance and position 0): the autopilot stayed in NAV and closed from 113 m to about 20 m on the
  deviation alone. The analog nav port failed (`GPS IS ACTIVE WAY POINT` false, deviation 0): the autopilot dropped from
  NAV to HDG in the same second, turned to the heading bug and stayed in HDG after the repair. Every port failed: the
  same as the analog port. After a repair every output came back within 1 s.
- **Hot swaps, flight 2.** At the load the Duke set `L:KLN90B_Disabled` before the KLN powered on, so the unit wrote no
  null state at its power-on; the Duke grays its hot swap out until the aircraft has loaded and holds each swap read-only
  for a while. Several swaps from the KLN to the GNS and between the other units, and back: no crash.
- **The crash.** Every port failed (the old null state), then a swap from the KLN to the GNS: the sim crashed to desktop
  at the first swap. The bisection, each case one swap from the KLN to the GNS:

  | Case | `GPS FLIGHT PLAN WP COUNT` / `WP INDEX` | The other GPS SimVars | Result |
  |---|---|---|---|
  | The old null state | 0 / 1 | zero | crash |
  | A | 0 / 0 | zero | no crash |
  | B | 0 / 1 | live values | crash |
  | D: the unit working, Direct To TF3, the last of three | 3 / 3 | live | no crash |
  | C | 1 / 2 | live values | no crash |

  So an index above 0 with a count of 0 crashes the sim at a hot swap. The 1-based index the unit writes is safe. The
  guesses of the FS2020 comment (a start on the runway, the unit disabled at once, no calculation tick yet) were wrong:
  the unit had ticked for minutes before the crashing swap. The fix is #462.
- **The check of the fix** (the #462 build, the same aircraft, FPL 0 active): with the KLN switched off its GPS SimVars
  read the null state, `WP COUNT` / `WP INDEX` 0 / 0, position, distance and deviation 0, both active flags false,
  `GPS OBS ACTIVE` unchanged and `GPS OVERRIDDEN` 1. The Duke's CDI needle returned to center quickly and smoothly, its
  own animation. The swap to the GNS: no crash. Back on the switched-off KLN, `GPS OVERRIDDEN` read 0 although
  `L:KLN90B_WriteGpsSimvars` was 1, so the sim's own GPS filled the SimVars with the live position; something on the
  aircraft's side cleared the claim. Switched on, the KLN claimed the GPS again and wrote live values (TF1 to TF2, count
  3, index 2).
- **The GNS after a KLN power-off** (#463): swapped to after the KLN had been switched off, the GNS showed NO GPS
  POSITION, SEARCHING and its INTEG light for minutes, until the avionics master was cycled. Both receivers publish their
  synced events on index 1, and the GNS's display follows the KLN's reset. Not related to the GPS SimVars.

**2026-11-03** (the check of #463: the same Duke, the KLN as primary and the GNS 430 as secondary GPS; a passive
listener on the SDK's event-bus sync in the KDI 572 page, which recorded what reached the page and sent nothing)
- **Before the fix.** One bus sent `gps_system_covar_matrix_1` and the three DOP topics every 5 s. It was the KLN's: the
  KLN page's own listener never got its packages, the GNS 430 page did. With both receivers on a fix their states
  agreed, which is why a primary/secondary setup showed no difference on the GNS.
- **The check of the fix** (the #463 build, the receiver on a bus of its own that syncs nothing): no `gps_` topic on the
  generic data listener or on the flow events for two minutes, the KLN's power-off and a swap to the GNS included. The
  GNS showed its position after the swap. The listener saw no GNS receiver traffic on either channel, before or after
  the fix, so the silence after the fix has no positive control; the GNS's position after the swap is the evidence.
