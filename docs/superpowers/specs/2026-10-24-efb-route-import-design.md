# EFB route import: procedures, airways, point-bearing-distance fixes, the waypoint limit: design

Date: 2026-10-24. Issues: #195 (point-bearing-distance legs dropped, airways flown direct, a long route loses its
destination) and #378 (import SID, STAR and approach). Branch: `efb-route-195-378`.

## 1. Intent

When the EFB sends a route, FPL 0 should hold the route the pilot planned, as far as the unit can hold it: the SID, the
en-route fixes with the airways expanded, the STAR, the approach, and the destination. When the route does not fit, the
pilot gets the beginning of the route without holes and the destination, and is told which waypoints were left out, so
that the rest can be entered by hand once the beginning is flown.

The real unit has no EFB. The import is the project's own feature, but its result must be a plan the unit itself could
hold: the same limits (4-1: 30 en-route waypoints; #221: 45 legs in FPL 0 with procedures), only the procedures APT 7
and APT 8 offer, and an approach that cannot be edited.

The examples are the routes the maintainer posted on #195 and #378 (KMIA HURCN4.KPASA KPASA Q118 BONNT VEECK5.BONNT
ILS 27C KORD; EDDF DKB180/15 WLD EDDM; KYKM YKM7 TITON V4 CHINS CHINS5(.YKM) RNAV 32L Y(.HUMPP) KBFI).

## 2. Goals, non-goals, anti-goals

**Goals**
- Load the SID, STAR and approach of the route into FPL 0 (#378).
- Turn a point-bearing-distance leg into a temporary waypoint (#195.1).
- Expand an airway into its fixes (#195.2).
- Keep the destination when the route is too long (#195.3), and apply the limits by the rules of section 4.
- Tell the pilot about every waypoint left out, with `WAYPOINT xxx DELETED`.

**Non-goals**
- No special handling of the power-on reset. A fresh sim session counts as an hour off (`PowerSupply`), so a route
  loaded while the unit is off loses its procedures at the first power-on (6-5). The maintainer adds a note to the wiki.
  The normal case is that the unit is on when the route arrives.
- No change to `KlnEfbSaver` (it already sends SID, STAR and approach) or to `Flightplanloader.loadIcaos`, which the
  stored flight plan loaders (V1, V2) use.
- PPOS legs (`isPpos`) stay ignored, as today.

**Anti-goals** (a failure even if it works)
- A gap in the plan between its first and its second-to-last waypoint that the pilot cannot see coming (section 4).
- A procedure loaded in part.
- A procedure FPL 0 holds that APT 7/8 would not have let the pilot load (unrecognized type, RF legs, a transition the
  unit would have asked for).
- `REDUNDANT WPTS IN FPL` from the import.
- Any change to the public contract: the EFB route sync keeps its meaning, only its result is fuller.

## 3. Approaches

1. **Chosen (maintainer and Claude agreed).** Resolve everything first, then apply the rules in one step. The loader
   first turns the route into an ordered list of resolved segments, each marked usable or not; a separate, synchronous
   function then applies the limits and returns the legs to load and the waypoints to report. The rules live in one place
   that a unit test reaches without navdata; the cost is a few lookups for parts that end up cut, which the messages need
   anyway (their idents).
2. Fill one segment at a time with a running count. Shorter, but the rules end up inside the async lookups, the reserved
   destination and the stop after a cut become flags in the loop, and a test reaches them only through a whole route.
3. Load the en-route part with `loadIcaos`, then insert the procedures with the APT 7/8 code. Rejected: that code deletes
   legs at the front to make room, asks questions and shows `REDUNDANT WPTS`, and it cannot know before the en-route part
   is cut how much room the SID needs.

## 4. The rules (maintainer rulings, 2026-10-24)

**Order.** FPL 0 is loaded start to finish: departure airport, SID, en-route fixes, STAR, approach, destination airport.
This is the order APT 7/8 build: the SID follows the departure airport, the STAR and then the approach come before the
destination airport (`Apt7Page.loadNow`, `Apt8Page.loadNow`).

**Limits.** At most 30 en-route legs (type USER, airports included) and 45 legs in all (`MAX_LEGS`, `MAX_FPL0_LEGS`,
`legsFit`). The destination's place is reserved: it takes one en-route and one total leg, whatever comes before it.

**Fit.** Segments are taken in order while they fit.
- A SID, STAR or approach is taken whole or not at all.
- The en-route part may be cut partway, at the first fix that does not fit.
- At the first part that does not fit, it and **everything after it** are left out, except the destination. A later
  segment that would fit on its own is still left out (no gap: if the STAR does not fit, the approach is not loaded).

**Gaps.** Between the first and the second-to-last waypoint there is never a gap, with one exception: a procedure that
is invalid for the unit is skipped, and loading goes on after it. Between the second-to-last waypoint and the
destination there may be a gap (the cut).

**Invalid procedure.** A procedure is invalid when APT 7/8 would not have let the pilot load it as the route names it:
- the airport or the procedure is not in the database, or the procedure is not in the APT 7/8 list
  (`SidStar.isProcedureRecognized`, `SidStar.isApproachRecognized`: unrecognized approach types such as the ILS, RF legs,
  RNP AR, no recognized leg);
- the procedure needs a transition, runway or IAF the route does not give. The import makes the choices the APT 7/8 flow
  makes: where that flow selects on its own (zero or one transition, zero or one runway transition), so does the import;
  where it would show a selection page, the import takes the one the route names (`departureTransition`,
  `departureRunway`, `arrivalTransition`, `destinationRunway`, `approachTransition`), and only if it is one that page
  would list. Otherwise the procedure is invalid. Example: CHINS5 without a transition and RNAV 32L Y without an IAF in
  the first #378 route are invalid; with YKM and HUMPP they are valid. (Memory: approaches start at an IAF, never at the
  IF; a procedure with transitions needs one.)

**Duplicates.** Duplicated fixes stay duplicated: KPASA at the end of the SID transition and again as the first
en-route fix, BONNT at the end of the en-route part and again at the start of the STAR. No `REDUNDANT WPTS IN FPL`.

**Messages.** `WAYPOINT xxx DELETED`, one per waypoint, in route order, for:
- every en-route fix cut by the limit;
- every leg of a procedure left out, whether cut by the limit or invalid. The legs are those after the unit's filter
  (`SidStar.getKLNProcedureLegList`, `getKLNApproachLegList`: unsupported leg types are gone, which brings the number
  down). For an invalid procedure that the database has, the legs are those of the procedure without the missing
  transition (Claude's call); for a procedure or airport the database does not have, nothing is known and nothing is
  reported (Claude's call);
- a fix that cannot be found or a temporary waypoint that cannot be created, as today (these are dropped and loading
  goes on: the fix cannot be loaded at all, so this is not a cut).

The existing limit stays: more than 10 messages give the first 10 and `OTHER WAYPOINTS DELETED` (as `loadIcaos` does).

## 5. Resolving the route

**Departure and destination.** As today: the route's airport ICAOs, when not empty.

**Lat/lon legs.** As today (`KlnEfbLoader.loadLeg`): a held user waypoint (#187), otherwise a new temporary waypoint
(region XY, `getUniqueIdent` on the name or `CUST`).

**Point-bearing-distance legs (#195.1).** A leg with `hasPointBearingDistance` and a reference facility becomes a
temporary waypoint like a named lat/lon leg:
- Position: the reference facility's position moved by `bearing` (true, per the SDK's `FlightPlanRouteEnrouteLeg`) and
  `distance` NM, as the SDK's Garmin loader does (`GeoPoint.offset`); a distance of 0 is the reference position.
- Name: from the leg's `name` like a named lat/lon leg: its first four characters, made unique with the first free letter
  (`getUniqueIdent`). `DKB180` becomes `DKB1`. An empty name falls back to the reference ident, then `CUST`.
- A reference facility that cannot be found: `WAYPOINT <name> DELETED`, as for a fix that cannot be found.

**Airways (#195.2).** A leg with `via` is the exit fix of an airway. The entry is the fix before it in the resolved route
(the last fix of a valid SID, or the previous en-route fix). The fixes between entry and exit along the airway are
inserted before the exit, in the direction of travel; the entry is not inserted again. Airway fixes come from the
database as intersections; one that is a VOR or NDB is loaded as that facility (as the SDK's Garmin loader does). When the
airway, the entry or the exit cannot be resolved (for example the entry is a user waypoint, or not on the airway), the
leg goes direct to the exit fix, as today, with no message (the exit fix is loaded, so nothing is deleted).
Expanded fixes are en-route fixes: they count toward the 30 and can be cut.

This needs `getAirway`: `KLNFacilityLoader.getAirway` throws today. It delegates to the sim's facility loader;
`ActualFacilityClient` gains `getAirway`, and the test harness's `MemoryFacilityClient` gains airways.

**Procedures (#378).** Found by name with the SDK's `AirportUtils.findDepartureArrivalIndexesFromName` and
`findApproachIndexesFromIdentifier`, then checked by section 4 and converted with `SidStar.getKLNProcedureLegList` and
`getKLNApproachLegList`, the same conversion APT 7/8 use (DME arc entries, OBS questions, fix types, `procedure`
information for the saver).

## 6. Loading FPL 0

`Flightplan.load` keeps only USER legs (it copies a numbered plan into FPL 0), so the import needs a load that keeps the
procedure legs. It replaces the legs and publishes once, as `load` does. An approach loaded this way is protected from
editing as any approach is (leg type APP).

Temporary waypoints created for legs that end up cut are removed from the repository again after the fit, so that OTH 3
does not list waypoints no plan uses (Claude's call; the power-on cleanup would remove them too, but only later). This
covers the waypoints this import added and only those that no flight plan uses: the lat/lon and point-bearing-distance
waypoints, and the DME arc entries `SidStar.getArcEntryData` adds while converting a procedure that is then cut or
invalid. A waypoint that was in the repository before the import is never removed (Claude's call).

**Overlapping syncs.** A second route can arrive while an import is still resolving. The newest route wins: an import
that is overtaken does not load FPL 0 and posts no messages (Claude's call).

## 7. Constraints

- Public contract: the EFB route sync (CLAUDE.md). The wiki FAQ for the EFB sync needs the change; Claude drafts the
  text, the maintainer edits the wiki (it also gets the power-on note of section 2).
- `target: es2017`. The import is a one-off async load, not a tick, so the tick-cost bar does not apply; it must not
  run per tick.
- `REDUNDANT WPTS IN FPL` stays in APT 7/8 only.
- Hot-swap: a route arriving while the unit is disabled is still ignored (#188, #353).
- Copyright: manual pages are cited, never quoted.

## 8. Commits

One commit per issue (CLAUDE.md), each with its tests and doc changes:
1. `fixes #195 …`: the resolve-then-fit structure, point-bearing-distance legs, airway expansion, the destination kept
   (fit rules with en-route segments only). The characterization "keeps the first 30 waypoints of a route of 31 and
   reports the destination deleted" in `test/render/services/KlnEfbLoader.test.ts` changes to the new rule.
2. `fixes #378 …`: procedure segments, the invalid-procedure rules, the load that keeps procedure legs, the message per
   procedure leg.

This design document is committed on its own before them.

## 9. Tests

At the cheapest stage that observes the behavior (test/README.md):
- **Unit:** the fit function, on plain segment lists: the limits, the reserved destination, the cut inside the en-route
  part, whole-or-nothing procedures, nothing after a cut, an invalid procedure skipped with loading going on, the report
  order, the 10-message limit.
- **Render** (`efbRoute` harness, procedures from `test/harness/navdata/procedures.ts`): each example shape from #195 and
  #378 (airway expanded, point-bearing-distance waypoint at its position and name, duplicates kept, ILS skipped with its
  waypoints reported, STAR without a needed transition skipped, with it loaded), a long route keeping its destination, a
  procedure cut by the limit, and the ruling of section 2: a route loaded with the unit off loses its procedures at the
  first power-on of a fresh session.

## 10. Left to the builder

- The names and shapes of the segment type, the fit function and the new `Flightplan` load method.
- Whether the fit function reuses `legsFit` or counts on its own (the limits must stay the constants).
- How `efbRoute` grows to describe procedures, airways and point-bearing-distance legs.
- Updates to `docs/architecture.md` and the CLAUDE.md public-contract line about the EFB sync, if their wording no longer
  fits.
