# VNAV a second time (#73, #418): design

Date: 2026-10-24. Issues: #73, #418. Branch: `fix-73-vnav-second-time`. A small change: this short design records
what was settled in chat.

## Intent

#73 reports that VNAV does not work properly a second time (video 5) and that the right-hand NAV 4 does not show the
data entered on the left (video 6). The videos predate the #194 fix. Reproduced against today's code with throwaway
render tests:

- **Video 6:** with NAV 4 on both sides, a SEL change on one side is not shown on the other (`Nav4Page.redraw` sets
  every field but `sel`). The AVsoftech 90B trainer syncs all entries between both pages at once (the maintainer,
  2026-10-24).
- **Video 5:** VNAV started at 32 s. The pilot then confirmed the same waypoint (LFLJ) with ENT, `setVnavWpt`
  cancelled VNAV, and the cursor never went back onto ANGLE.
- **#418 (found here):** since #194 a new angle entered while VNAV is active is only stored. VNAV stays active and
  shows an advisory altitude above the aircraft (`VNV13900ft` at 7500 ft), where 5-8 step 5 (figures 5-26, 5-27)
  shows ARMED or a countdown.
- The lead in the #73 comment (the old angle kept after the end of a descent, re-armed on every tick under the
  ANGLE cursor) is invisible today: it re-arms and goes Inactive in the same call, and any edit clears it.

## Evidence

- Pilot's Guide 5-7 to 5-9 (NAV 4 programming, the ANGLE cursor start, the entered angle), C-1 (valid VNAV waypoints).
- KLN 89 trainer, 2026-10-06 (`docs/kln89-trainer-record.md`): at the end of the path the 89 goes Inactive and resets
  its inputs (from-altitude = target, offset +00, VS 0, waypoint = the active waypoint, GS kept); a new selected
  altitude then starts a second VNAV at once.
- KLN 89 trainer, 2026-10-24 (agent): a VS turned while active gives a countdown (start ahead) or a new advisory
  (start behind), never Inactive. The waypoint field is a selector: stepping to another waypoint cancels at once.
  The VNAV waypoint sequenced (active or armed) resets the inputs as at the end of the path; VNAV to a waypoint
  further ahead is kept through a sequence.
- AVsoftech KLN 90B trainer, 2026-10-24 (agent; third party, unreliable): a turned angle while active gives ARMED;
  ENT on the unchanged waypoint and re-typing the same ident keep VNAV active. Its VNAV has no end state at all
  (the advisory falls below SEL), so it says nothing about the end of a descent.

## Rulings (the maintainer, 2026-10-24)

- Re-entering the same VNAV waypoint keeps VNAV; only a different waypoint cancels it.
- At the end of a descent the inputs reset as on the 89, the only evidence for that behavior.
- A new angle restarts VNAV: approach A (below).

## Approaches for #418

- **A (chosen):** a `Vnav.setAngle(angle)` stores the angle, sets the state to Inactive and arms at once. Explicit
  and synchronous, like the 89's recompute on a knob turn.
- B: `setVnavAngle` only sets Inactive and lets the display tick's `armVnav()` restart it. Less code, but the
  restart depends on the cursor position; an angle edit from anywhere else would silently not re-arm.
- C: Vnav remembers the angle it armed with and re-arms in `tick` on a difference. Dropped: a hidden comparison of
  this kind is how #418 slipped in.

## Design

### #418: a new angle restarts VNAV
`Vnav.setAngle(angle)`: `nav4VnavAngle = angle`, state Inactive, then `armVnav()`. `Nav4Page.setVnavAngle` calls it.
A steeper angle gives ARMED or a countdown; a shallower one whose start lies behind the aircraft starts at once with
the new path's advisory altitude (as the 89 did). An angle of 0.0 leaves VNAV Inactive. The #194 rule is unchanged:
the cursor staying on ANGLE does not re-arm an active path.

### #73 part 1: both NAV 4 pages show the same entries
`Nav4Page.redraw` also sets `sel` from `nav4SelectedAltitude`, as it does for the offset and the angle.

### #73 part 2: the same waypoint keeps VNAV
`Nav4Page.setVnavWpt` compares the entered waypoint with `vnav.getVnavWaypoint()` (ICAO). The same one is stored
without a disarm; a different one disarms as today. The comparison is with `getVnavWaypoint()`, not with
`nav4VnavWpt`, which is null while NAV 4 shows the active waypoint.

### #73 part 3: the inputs reset at the end of a descent
When `Vnav.tick` takes an active path to Inactive because the advisory altitude reached SEL (descent or climb), it
resets: `nav4VnavAngle = null` (the page shows the computed angle again, the 90B's form of the 89's VS 0),
`nav4VnavDist = 0`, `nav4VnavWpt = null` (the page shows the active waypoint), `nav4FromAlt = nav4SelectedAltitude`
(the FR field of a unit without an altitude input; the 89's from-altitude = target). SEL is kept.

**When the VNAV waypoint is sequenced first** (KLN 89 trainer, 2026-10-24, high): an active VNAV and an armed one
(countdown) whose waypoint was sequenced both showed the same reset at the next recompute: Inactive, from = selected
(editable again), selected kept, the new active waypoint, offset +00, VS 0, GS kept. VNAV to a waypoint further
ahead was not touched when the active waypoint was sequenced (as the code does today). The end-of-path reset with an
offset was seen again. With offset 0 the 89 may treat the passed waypoint as the end of the path; the screen cannot
tell the two apart, and the rule below covers both.

So the same reset also runs in `Vnav.tick` when a programmed VNAV waypoint (`nav4VnavWpt` not null) stops being
valid, whatever the state. The reset does not run while `nav4VnavWpt` is null (nothing programmed), so the pilot's
SEL, offset and FR entries are never cleared under their hands.

**My call: every way the VNAV waypoint becomes invalid resets.** The trainer shows only the sequence. The other ways
(a Direct To elsewhere, the waypoint deleted from FPL 0, OBS mode, #338) end the programming just the same, and one
rule is simpler than telling them apart. #338's 89 observation (the active waypoint shown afterwards) agrees. These
cases are characterizations.

**My call: no start at a displayed 0.0.** After the reset the aircraft is a few feet off SEL, so the computed angle
is tiny but not 0 (e.g. -0.01°), and today the cursor on ANGLE would start VNAV with it. `armVnav` starts only when
the angle rounded to tenths is not 0, as shown on the field. The 89 did nothing with VS 0 (2026-10-06).

## Tests

- #418: a render test that starts VNAV with the cursor and turns the angle to -1.8 (`VNV ARMED`, 5-8 step 5,
  figure 5-27); a shallower edit with the start behind the aircraft; unit tests of `setAngle`.
- #73: a render test with NAV 4 on both sides and SEL changed on one; a render test that re-enters the same
  waypoint while active (stays active) and one that enters a different valid waypoint (Inactive); unit tests of the
  reset at the end of the path, descent and climb (the existing characterizations "goes inactive when the path
  reaches SEL at the target" and its climb twin gain the reset, labelled with the 89 trainer check); the reset when
  an active and an armed VNAV waypoint is sequenced (flight or render stage, 89 trainer); no reset while the VNAV
  waypoint is still ahead after a sequence; the reset on a Direct To elsewhere (characterization); a test that the
  cursor on ANGLE after the reset starts nothing (my call, a characterization). The #338 tests are checked for
  assumptions about kept inputs.
- Labels cite only what the source shows: the 89 shows the reset and the VS behavior; the AVsoftech trainer is
  noted as unreliable; the 0.0 rule and the 90B mapping (angle null, FR = SEL) are characterizations.

## Commits and docs

- `fixes #418` first (`Vnav.ts`, `Nav4Page.tsx`, its tests), then `fixes #73` (the three parts, their tests, the
  trainer record block of 2026-10-24 in `docs/kln89-trainer-record.md`). Each with its doc changes; the #73 comment's
  characterization lines in the record and in `docs/` are updated where they describe the kept angle.
- No manual text anywhere; page numbers and paraphrase only.

## Left to the builder

The exact test geometry, and where the reset lives inside `Vnav.tick` (a private helper is expected).
