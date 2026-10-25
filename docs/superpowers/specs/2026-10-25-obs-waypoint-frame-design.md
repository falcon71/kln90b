# OBS mode measured at the active waypoint (#370, #371, #425)

Date: 2026-10-25. A small change; short design. #425 was added the same day after a second trainer check.

## Intent

In OBS mode the unit expresses everything about the course in the frame of the active waypoint: the course is the
course *at* the waypoint, held true, and magnetic values use the variation *at* the waypoint. The simulation already
lays the OBS line that way (#151), but three things still differ: the course a Direct To sets (#370), the variation
and the bearing and track the pilot reads (#371), and how the course is held when the variation changes and how a
knob click steps it (#425). Goal: emulate the KLN 89 exactly; the maintainer is certain the 90B behaves the same here.

## Evidence

Two KLN 89 trainer checks of 2026-10-25 (docs/kln89-trainer-record.md, the two OBS blocks of that date). In the
first, the variation was set to 0° by hand and every reading compared with four independently computed models; in
the second, both storage hypotheses were predicted for every reading.

- The OBS line is the great circle through the active waypoint whose course at the waypoint is the OBS course; it does
  not depend on where the aircraft was when the course was set. This is today's `ModeController.setObs`, so the line
  itself does not change.
- A Direct To in OBS mode sets the course of the direct path at the waypoint (the great circle's final course), and
  keeps the fraction. That is the fix #370 suggested.
- LEG to OBS keeps the deviation by taking the leg's course at the waypoint: the #151 fix is right as it stands.
- OBS mode uses the variation at the active waypoint, a VOR its published variation (5-35).
- In OBS mode the NAV 1 bearing is the course at the waypoint of the great circle from the aircraft (the same quantity a
  Direct To sets), and the NAV 1 track is the true track plus the waypoint's variation. Waypoint pages do not change.
- The course is held true: an ACTIVATE to a waypoint with another variation, and a changed SET 2 variation, keep the
  line and change the magnetic course shown by the variation difference.
- One click of the knob on the OBS course sets the course shown (rounded) plus or minus one as a whole magnetic degree;
  a held fraction is lost.

This corrects the 2026-10-14 reading that #370's comment and #371 were built on ("the course is the bearing at the
aircraft"): those numbers mixed the meridian convergence with an unknown variation.

## Goals

1. **#370:** a Direct To in OBS mode sets the course of the direct path at the waypoint, so the deviation is centered
   on any distance. The `d› CRS` message shows that course in magnetic, with the OBS variation.
2. **#371:** in OBS mode, when the variation is valid (5-44), the OBS variation is the variation at the active waypoint:
   a VOR's published variation (unchanged), any other waypoint the variation model at its position. Without an active
   waypoint, and when the variation is invalid (5-44, #190), it stays as today.
3. **#371, the displays:** in OBS mode the bearing to the active waypoint shown to the pilot is the course at the
   waypoint of the great circle from the aircraft, and the track shown is the true track; both in magnetic with the OBS
   variation. In LEG mode both stay as today (the initial bearing and the track with the aircraft's variation).
4. **#425:** the unit holds the OBS course true. The magnetic course is derived from it with the OBS variation wherever
   it is shown or sent, so an ACTIVATE to a waypoint with another variation, or a change of the variation in use, keeps
   the line and changes the number. A knob click sets the shown course ± 1 as a whole magnetic degree.

## Non-goals

- The outputs to the aircraft keep their meaning (maintainer, 2026-10-25): the `L:KLN90B_GPS_WP_BEARING` LVar, the GPS
  SimVars (`GPS WP BEARING`, `GPS WP DESIRED TRACK`, `GPS WP TRACK ANGLE ERROR`, `GPS MAGVAR`). The OBS output to the
  indicator stays the unit's magnetic course; with #425 that is the derived one.
- The OBS line, the deviation, the TO/FROM rule, the alert, roll steering and the maps' drawing (they work in true).
- Waypoint pages, NAV 2, SET 1, the wind and other pages that show bearings or tracks outside the NAV 1 family.
- #151 needs no change. The first check's 4-of-12 presses that kept an earlier whole-degree course are taken as a
  trainer defect and not emulated.
- The 89 let a VOR's published variation win over a manual SET 2 variation inside the variation area. The 90B takes a
  hand-entered variation only outside the area, where #190 decided the OBS course is referenced to it for a VOR too
  (5-44). Not changed here.

## Approaches

1. **Helpers on `ModeController` (chosen by the maintainer).** `ModeController` gains a magnetic bearing to the active
   waypoint and a magnetic track for display: in OBS mode in the waypoint's frame, in LEG mode today's values. The
   displays switch to them. Small, explicit, and leaves everything else on the aircraft's variation.
2. **Switch the unit's variation in OBS mode** (`KLNMagvar.getCurrentMagvar` returns the waypoint's variation). Rejected:
   it would also shift the waypoint pages, SET 1 and the wind, which the trainer showed stay put.

For #425 there is one sensible way: store the true course and derive the magnetic one. Keeping `obsMag` and
re-converting it at every variation change would need a hook on every path that changes the variation in use (an
ACTIVATE, the edge of the area, a SET 2 entry, a change of the active waypoint) and would drift with rounding.

## What is decided

- **One quantity, one place.** The course at the waypoint of the great circle from the present position (the final
  course) is computed by one shared function, used by the Direct To (#370) and by the display bearing (#371), so the
  `CRS` message, the course set and NAV 1 agree.
- **#370** changes `DirectToPage.performDirectTo` (the plain Direct To branch in OBS mode); ACTIVATE stays as #154 made
  it until #425.
- **#371** changes `ModeController.getMagvarForObs` (non-VOR waypoints: the model at the waypoint, as
  `KLNMagvar.getReferenceMagvar` already computes it), and adds the two display helpers. The displays that switch:
    - NAV 1 bearing (the 89's NAV 1 bearing; trainer evidence),
    - by analogy on the 90B's own pages: Super NAV 1 bearing, NAV 3 track, the Super NAV 5 bearing, radial and track
      fields, and the track value of the map orientation (NAV 5 and Super NAV 5 labels).
    The map's rotation stays in true and is not touched.
- The display bearing has the cadence of `bearingToActive` (the 1 Hz calculation) and is null whenever it is.
- **#425** replaces `NavPageState.obsMag` by a true course (reset at power-on as today). Everything that reads the
  magnetic course takes it from one `ModeController` getter (the status line, Super NAV 5, MOD 2, NAV 3, the OBS field,
  the CRS message, the persistent messages, the output). Courses set by the unit in true (Direct To, LEG to OBS) are
  stored as they are; courses set in magnetic (a knob click, an indicator reading) are converted with the variation in
  use at that moment. ACTIVATE keeps the true course and lays it through the new waypoint.
    - **An indicator the unit reads (`Input.ObsSource`) stays the source of the course** (5-37: ACTIVATE keeps the
      selected course, which on such an installation is the indicator's): when its magnetic course differs from the
      unit's, the unit takes it. After an ACTIVATE across a variation change, a non-driven indicator therefore keeps
      its magnetic number. An unchanged indicator must not re-lay the course every tick (#122, the `setObs` guard):
      compare without floating-point round-trip noise.
    - **A driven indicator (`Output.ObsTarget`)** is slewed to the new magnetic course when the variation in use
      changes while the true course is held, and is not read back over it (#261).
- **Three commits**, `fixes #370`, `fixes #371`, then `fixes #425`, each with its tests and doc changes (the
  architecture note on `KLNMagvar`, `getMagvarForObs` and the `obsMag` convention). The design and the trainer record
  go in commits of their own before them.

## Tests

- #370: the `it.fails` pin `centers the deviation after a long Direct To in OBS mode (5-37, #370)` in
  `test/render/pages/left/DirectToObs.test.ts` becomes a test; the course set and the `CRS` message are asserted
  against an independently computed final course.
- #371: a position-dependent variation (the harness's `env.magvar` is a function of lat/lon), so that the aircraft's
  and the waypoint's variation differ and a unit that uses the wrong one fails. Cover the OBS course, NAV 1 and the other
  switched displays, a VOR (published variation), LEG mode unchanged, and the 5-44 invalid case unchanged.
- #425: ACTIVATE between waypoints of different variation keeps the line and changes the number (no indicator); a knob
  click from a fractional course lands on the whole degree; a variation change outside the area (SET 2) keeps the line;
  a read-only indicator keeps its number after ACTIVATE; a driven indicator is slewed to the new number; an unchanged
  indicator does not re-lay the course.
- Existing tests that assume the aircraft's variation in OBS mode, or read `obsMag`, change, e.g. `with the variation at
  the aircraft for an active airport (10 E)` in `test/render/services/ModeControllerObs.test.ts`.
- Labels: a trainer citation only for what the 89 showed (the OBS course, the Direct To course, the NAV 1 bearing and
  track, the variation, ACTIVATE keeping the true course, the knob's whole degree); the 90B's own pages, the `CRS`
  message and the indicator rules are the 90B's (5-37) or characterizations by analogy.

## Left to the builder

- Where the shared final-course function lives, and whether the display bearing is stored in `NavPageState` next to
  `bearingToActive` (then reset with it) or computed by the helper from the 1 Hz state.
- The helper and field names, and how the indicator comparison avoids round-trip noise.

## Amendment 2026-10-25 (#427)

A driven indicator holds whole degrees: the maintainer's sim check of 2026-10-25 found that `K:VOR1_SET` stores the
course as a whole degree, rounded half up (11.11 and 11.49 read back as 11, 11.5 and 11.7 as 12), and that a value
outside 0 to 359 after rounding reads back as 0 (359.9, 370 and -10 all read 0). The unit holds the fraction itself (a
Direct To course of 095.54), so the indicator's echo of the course last sent is not a turn of the indicator by the
pilot, and reading it back would snap the course to the whole degree and leave a deviation (about 0.8 NM on the long
geometry of #370).

- With a driven indicator (`Output.ObsTarget` not 0), a read-back equal to `normalizeHeading(Math.round(obsOut))` is
  the unit's own course and is skipped, as the exact `obsOut` match is. The comparison goes through `diffAngle`, so
  360 and 000 are the same course. Any other value is a pilot's turn and is taken as before.
- A read-only indicator is unchanged.
- The unit only sends courses of 0 up to 360, so the sim's reading of a value outside that range is not needed by the
  rule. `FakeSim.applyObsKeyEvents` stores the value as the sim does.
