# OBS mode measured at the active waypoint (#370, #371)

Date: 2026-10-25. A small change; short design.

## Intent

In OBS mode the unit expresses everything about the course in the frame of the active waypoint: the course is the
course *at* the waypoint, and magnetic values use the variation *at* the waypoint. The simulation already lays the
OBS line that way (#151), but two things still use the aircraft's frame: the course a Direct To sets (#370), and the
variation and the bearing and track the pilot reads (#371). Goal: emulate the KLN 89 exactly; the maintainer is
certain the 90B behaves the same here.

## Evidence

The KLN 89 trainer check of 2026-10-25 (docs/kln89-trainer-record.md, the OBS block of that date), with the variation
set to 0° by hand and every reading compared with four independently computed models:

- The OBS line is the great circle through the active waypoint whose course at the waypoint is the OBS course; it does
  not depend on where the aircraft was when the course was set. This is today's `ModeController.setObs`, so the line
  itself does not change.
- A Direct To in OBS mode sets the course of the direct path at the waypoint (the great circle's final course), and
  keeps the fraction. That is the fix #370 suggested.
- LEG to OBS keeps the deviation by taking the leg's course at the waypoint: the #151 fix is right as it stands.
- OBS mode uses the variation at the active waypoint, a VOR its published variation (5-35).
- In OBS mode the NAV 1 bearing is the course at the waypoint of the great circle from the aircraft (the same quantity a
  Direct To sets), and the NAV 1 track is the true track plus the waypoint's variation. Waypoint pages do not change.

This corrects the 2026-10-14 reading that #370's comment and #371 were built on ("the course is the bearing at the
aircraft"): those numbers mixed the meridian convergence with an unknown variation.

## Goals

1. **#370:** a Direct To in OBS mode sets the course of the direct path at the waypoint, in magnetic with the OBS
   variation, so the deviation is centered on any distance. The `d› CRS` message shows that course.
2. **#371:** in OBS mode, when the variation is valid (5-44), the OBS variation is the variation at the active waypoint:
   a VOR's published variation (unchanged), any other waypoint the variation model at its position. Without an active
   waypoint, and when the variation is invalid (5-44, #190), it stays as today.
3. **#371, the displays:** in OBS mode the bearing to the active waypoint shown to the pilot is the course at the
   waypoint of the great circle from the aircraft, and the track shown is the true track; both in magnetic with the OBS
   variation. In LEG mode both stay as today (the initial bearing and the track with the aircraft's variation).

## Non-goals

- The outputs to the aircraft stay as they are (maintainer, 2026-10-25): the `L:KLN90B_GPS_WP_BEARING` LVar, the GPS
  SimVars (`GPS WP BEARING`, `GPS WP DESIRED TRACK`, `GPS WP TRACK ANGLE ERROR`, `GPS MAGVAR`) and the OBS output to the
  indicator (it is `obsMag`, already the unit's course). The 89 cannot show them, and aircraft depend on them.
- The OBS line, the deviation, the TO/FROM rule, the alert, roll steering and the maps' drawing (they work in true,
  and `getObsTrue` follows the new variation by itself).
- Waypoint pages, NAV 2, SET 1, the wind and other pages that show bearings or tracks outside the NAV 1 family.
- #151 needs no change. The trainer's 4-of-12 presses that kept an earlier whole-degree course are taken as a trainer
  defect and not emulated.
- The 89 keeps its OBS course stored true (the course shown changed when SET 2 went back to automatic); the simulation
  stores `obsMag`. Inside the variation area the 90B has no hand-entered variation, so this shows at most on an
  ACTIVATE to a waypoint with another variation, or at the edge of the area. Out of scope; a lead to raise with the
  maintainer, not part of these fixes.

## Approaches

1. **Helpers on `ModeController` (chosen by the maintainer).** `ModeController` gains a magnetic bearing to the active
   waypoint and a magnetic track for display: in OBS mode in the waypoint's frame, in LEG mode today's values. The
   displays switch to them. Small, explicit, and leaves everything else on the aircraft's variation.
2. **Switch the unit's variation in OBS mode** (`KLNMagvar.getCurrentMagvar` returns the waypoint's variation). Rejected:
   it would also shift the waypoint pages, SET 1 and the wind, which the trainer showed stay put.

## What is decided

- **One quantity, one place.** The course at the waypoint of the great circle from the present position (the final
  course) is computed by one shared function, used by the Direct To (#370) and by the display bearing (#371), so the
  `CRS` message, the course set and NAV 1 agree.
- **#370** changes `DirectToPage.performDirectTo` (the plain Direct To branch in OBS mode); ACTIVATE stays as #154 made
  it.
- **#371** changes `ModeController.getMagvarForObs` (non-VOR waypoints: the model at the waypoint, as
  `KLNMagvar.getReferenceMagvar` already computes it), and adds the two display helpers. The displays that switch:
    - NAV 1 bearing (the 89's NAV 1 bearing; trainer evidence),
    - by analogy on the 90B's own pages: Super NAV 1 bearing, NAV 3 track, the Super NAV 5 bearing, radial and track
      fields, and the track value of the map orientation (NAV 5 and Super NAV 5 labels).
    The map's rotation stays in true and is not touched.
- The display bearing has the cadence of `bearingToActive` (the 1 Hz calculation) and is null whenever it is.
- **Two commits**, `fixes #370` then `fixes #371`, each with its tests and doc changes (the architecture note on
  `KLNMagvar`/`getMagvarForObs`). The design and the trainer record go in a commit of their own before them.

## Tests

- #370: the `it.fails` pin `centers the deviation after a long Direct To in OBS mode (5-37, #370)` in
  `test/render/pages/left/DirectToObs.test.ts` becomes a test; the course set and the `CRS` message are asserted
  against an independently computed final course.
- #371: a position-dependent variation (the harness's `env.magvar` is a function of lat/lon), so that the aircraft's
  and the waypoint's variation differ and a unit that uses the wrong one fails. Cover the OBS course, NAV 1 and the other
  switched displays, a VOR (published variation), LEG mode unchanged, and the 5-44 invalid case unchanged.
- Existing tests that assume the aircraft's variation in OBS mode change, e.g. `with the variation at the aircraft for an
  active airport (10 E)` in `test/render/services/ModeControllerObs.test.ts`.
- Labels: a trainer citation only for what the 89 showed (the OBS course, the Direct To course, the NAV 1 bearing and
  track, the variation); the 90B's own pages and the `CRS` message are characterizations by analogy.

## Left to the builder

- Where the shared final-course function lives, and whether the display bearing is stored in `NavPageState` next to
  `bearingToActive` (then reset with it) or computed by the helper from the 1 Hz state.
- The helper names.
