# APT 7: runways the unit cannot tell apart are one entry (#409): design

Date: 2026-10-26. Issue: #409 (bug). Branch: `fix-409-runway-groups`.

A small change, one `fixes #409` commit with its tests and doc changes (CLAUDE.md).

## 1. Intent

The runway list of a SID or STAR on APT 7 should offer only the choices the unit can tell apart. Today it lists one entry
per runway transition that the navdata delivers. The simulator splits a transition coded for parallel runways
(ARINC 424 `RWnnB`) into one transition per runway, and it also delivers runway transitions that differ only in what
the unit drops (altitudes, vector legs). So the pilot is asked to choose between entries that load the same waypoints.

## 2. Evidence

- Pilot's Guide 6-22, figure 6-35: PORTE9 at KSFO lists `RW01B`, `RW10B`, `RW19B`, `RW28B`, one entry per pair of
  parallels.
- AVsoftech KLN 90B trainer, checked by the maintainer (2026-10-26): the STAR CHINS2 at KBFI asks for no runway at all.
  Its runway transitions differ only by vector legs, which the unit drops, so the waypoint list is the same for every
  runway. That trainer is unreliable, but the maintainer adopts this finding.
- Simulator navdata, KBFI (AIRAC 2610, read through the sim debugger on 2026-10-26): CHINS5 has the transitions 14L,
  14R, 32L and 32R, each `IF RADDY, TF HUMPP, TF AUBRN, VM`. 14 and 32 differ only in altitudes and in the VM heading
  (343 vs 250). The STARs GLASR3, JAWBN7, OLM2 and SKYKO1 and the SID KENT1 (14L/14R) are alike. So the issue's expected
  `RW14B` / `RW32B` for CHINS5 is superseded: the unit asks for no runway there.
- Real navdata (AIRAC 2607, counted on 2026-10-26): about 4,000 SIDs and STARs with several runway transitions give the
  same waypoint list for every runway. About 440 merge runways of different numbers but keep other runways apart, for
  example CYVR CANUC7: 08B and 13 alike, 26L and 26R different.

## 3. Behavior

- **Same list.** Two runway transitions are the same when the legs the unit keeps from them are the same (§4): the same
  fixes in order, the same arcs, the same OBS reminders and fix marks. Altitudes, headings, vector legs and the leg
  type of a straight leg do not count.
- **One entry per runway number per list.** Runway transitions of one runway number with the same list are one entry.
  Two or more parallels in it are named `RWnnB` (for L/R and for L/C/R alike). A single runway keeps its own name
  (`RW14L`, `RW13`). Parallels whose lists differ stay separate entries.
- **Different numbers are not merged into one entry.** Runways of different numbers with the same list stay separate
  entries (`RW08B` and `RW13` in CANUC7), each loading the same legs, so the pilot finds the runway they use. A
  combined name does not fit 5 characters.
- **No runway step when every entry gives the same list.** When all recognized runway transitions of the procedure
  (for the chosen en-route transition) give the same list, the runway page is skipped, as it is today for a procedure
  with one runway transition. This holds for SIDs (runway first) and STARs (runway last), and for the CLR step-back,
  which skips the runway page by the same rule.
- **The runway that is loaded and reported.** A merged entry, and a skipped runway step, load the first runway
  transition of the group, in the navdata's order. Its runway number and designator go into the procedure information
  of the FPL 0 legs, so the EFB sync (`KlnEfbSaver`) reports that runway. It may be the wrong parallel or even the
  opposite end of the runway the pilot uses; the maintainer accepts this, as there is no better choice (2026-10-26).
- **A route that comes in from the EFB** keeps its runway: `EfbRouteResolver` picks the runway transition the route
  names, so it is reported back unchanged.
- **CLR back to the runway list** (#273) puts the cursor on the entry that holds the runway chosen before.

## 4. Approaches

- **A. Compare the kept legs, synchronously (chosen by the maintainer).** A new `SidStar` function builds each runway
  transition's leg list on copies, as `getKLNProcedureLegList` does, and runs the same `isLegSupported` filter and
  `filterOutDuplicates`. It compares the kept legs by what the unit uses: the fix ICAO, for an arc its navaid, radius and
  radials, the OBS reminder (the hold/procedure-turn leg types and the `askObsLegs` set), the fly-over flag and the
  IAF/FAF/MAP/MAHP flags. It is synchronous, so the runway list, the step-skipping and the CLR step-back share it.
  Its risk is that the comparison has to follow the conversion when that changes.
- **B. Compare the finished preview lists** from `getKLNProcedureLegList`. Exactly what the pilot sees, but async, which
  makes the step-skipping and the step-back async, and every DME arc entry it builds is added to the user waypoint
  repository once per runway. Not chosen.
- **C. Compare only the waypoint idents.** The simplest, but it misses a hold, an arc or a fly-over that differs between
  runways, and the duplicate dropped where the runway part joins the common route. Not chosen.

## 5. Left to the builder

- The shape of the grouping result (for example a list of groups, each with its display name and its member transitions)
  and where the name is formatted. The SDK's `RunwayDesignator` has a `B` value, but the procedure information keeps the
  first member's real designator (§3).
- The comparison has to include the common legs and the chosen en-route transition, so a duplicate dropped at the join
  is handled as the load handles it.
- `Apt7Page.tsx` replaces every `proc.runwayTransitions.length <= 1` check (step-skipping in `selectProcedure`,
  `selectTransition`, the step-back) and `Apt7RunwayPage.buildList` with the grouping. Its tick cost: the grouping runs
  on a key press, never in a tick; a procedure has a handful of transitions of a few legs.
- Existing APT 7 tests whose invented runway transitions happen to give the same list will change behavior; adjust their
  data so they keep testing what they test, rather than their expectations.

## 6. Tests

- Unit (`test/unit/data/navdata/SidStar.test.ts`): the grouping with invented procedures. Parallels with the same list
  are one group; parallels that differ are two; the same list under different numbers is one group per number; vector
  legs, altitudes and a CF vs TF leg do not split a group; a hold, an arc of another radius or a fly-over does.
- Render (`test/render/pages/right/Apt7Page.test.ts`): a STAR shaped like CHINS5 (invented facilities) asks for no
  runway and loads the first runway's legs; a SID with two pairs of parallels lists `RW01B`, `RW19B`, as figure 6-35;
  CLR from the transition page of a SID whose runway step was skipped goes back to the procedure list; CLR back to the
  runway list puts the cursor on the merged entry.
- Render (`test/render/services/KlnEfbSaver.test.ts`): a merged entry reports its first member's runway.
- The dated record: the CHINS2 check goes into `docs/kln89-trainer-record.md` as a 2026-10-26 block.
