# Fly-over waypoints in flight plans (#77) — design

Date: 2026-11-01. Size: a small change. Approved approach: the research comment on #77, plus the rulings below.

## Intent

Pilot's Guide 4-2..4-3 (and the install manual's AFMS, p. 104): some database waypoints are fly-over waypoints of
SIDs/STARs. When the pilot enters one into a flight plan, the unit asks whether it is used en route or as a SID/STAR
waypoint. A SID/STAR answer turns off turn anticipation at that waypoint only. Today the unit never asks, so the
waypoint is always flown with turn anticipation.

## What gets built

- **When the question comes:** the pilot enters an intersection whose ICAO names an airport (a terminal waypoint,
  `icaoStruct.airport` not blank, as `IntPage.tsx` detects it) into any flight plan, FPL 0 or a numbered one, and some
  SID or STAR of that airport has a leg to this fix with `flyOver` set. A fix that appears in that airport's procedures
  only as an ordinary fix gets no question (maintainer). The check loads the airport through `KLNFacilityLoader`, once
  per such entry.
- **Where it comes:** after the ENT that approves the waypoint page, before the leg is inserted
  (`FlightplanList.insertLeg`). Every pilot entry that ends there asks: append, insert in front of a waypoint, the
  alternate entry from a waypoint page (3-15), the REF to FPL path (#291).
- **The page (fig. 4-7a):** the left page shows the ident on line 1, `TYPE WPT` on line 2, `1 EN ROUTE?` on line 4 and
  `2 SID/STAR?` on line 5. The waypoint page stays on the right. The cursor starts on `1 EN ROUTE?`, the left outer
  knob moves it between the two, and ENT inserts the leg with the choice.
- **The choice (maintainer: "En route + flag"):** the leg stays `KLNLegType.USER`. A SID/STAR answer sets
  `flyOver: true`, which `NavCalculator` already honors (`toLeg.flyOver`), so navigation does not change. The leg shows
  the `:` separator and counts against the 30 en-route waypoints. `Use?` and `Use? Inverted?` copy it with the flag
  (they copy the leg objects); removing procedures does not touch it.
- **Persisted (maintainer, amended the same day):** the flag survives power cycles and sim sessions. See "Storage"
  below.
- **Changing the choice:** only by deleting the waypoint and entering it again.
- **No question, fly-by:** legs from the EFB route sync (maintainer), plans restored at power-on, the airport added by
  APT 7/8, CTR waypoints, D->. Waypoints added inside a SID/STAR of FPL 0 (6-23) are procedure legs already and are
  not asked.

## Storage

Persisted flight plans are a public contract (users keep their data across versions), and the MSFS user settings
should stay small. The maintainer chose to append the flags to the existing V2 string, without a format bump:

- **Layout of `fplN`:** the en-route (`USER`) legs as today, one V2 ICAO string of 19 characters each, then, only when
  at least one leg is a fly-over, a trailer: the leg count as two decimal digits, then the flags as a bitset in
  standard base64 (`A-Z a-z 0-9 + /`). Each base64 character holds 6 legs, least significant bit first: bit `i % 6` of
  character `i / 6` is the flag of leg `i`. That is `ceil(n / 6)` characters, at most 5 for 30 legs.
- **Telling the formats apart:** a plain V2 string's length is a multiple of 19, and a trailer of 3 to 7 characters
  never is. So `userDataFormat` stays 2, `UserFlightplanLoaderV2` reads both, and a plan without fly-over legs is saved
  exactly as before.
- **Reading:** the trailer is `length % 19` characters long. If its count does not equal `floor(length / 19)`, or a
  character is not base64, the flags are ignored and the legs load as en route. The flags must stay with their legs
  when `loadIcaos` drops a waypoint that is no longer in the database, and when it cuts the plan at 30 legs.
- **Older releases** (a downgrade) read the legs as before and lose the flags. The trailer comes out as one more short
  chunk, which most likely shows one spurious `WAYPOINT … DELETED` message for that plan. User waypoints are not
  affected.

Rejected alternatives: a V3 format with `userDataFormat` 3 and the count in front (an older release would read
format 3 as V1, fail, and save empty data over all plans and user waypoints); a separate `fplNflags` key (an older
release that edits a plan leaves stale flags behind, which then mark the wrong waypoint after the upgrade).

## Non-goals

- **En-route fixes and navaids.** A fly-over fix without an airport in its ICAO (about 20% of the SID fly-over fixes
  and 53% of the STAR ones in AIRAC 2607) is never asked, because finding its airports would mean loading every
  airport up to 237 NM around it (tick cost, see #77's comment). This includes VORs: the guide's own example in fig.
  4-7a is a VOR and would not be asked here.
- Mirroring the flag to the SDK flight planner or the EFB route answer.

## Approaches considered

1. **En-route waypoint with a flag (chosen).** As above. It is the only model that fits the numbered plans, where the
   guide places this question (4-2) and which hold no procedure legs.
2. **The same, shown with `.`.** It would make the choice visible, but nothing in either guide shows `.` outside a
   procedure. Rejected as an invention.
3. **A real SID/STAR leg.** It would show `.`, be dropped by `Use?` and removed with the procedures. It cannot exist in
   a numbered plan, so it contradicts 4-2. Rejected.

## Evidence

The KLN 89 trainer (2026-11-01) could not show the page: its demo database has one STAR (TRUDO1 at KMKE), no SIDs,
and none of 21 entries raised the 89's equivalent page. The AVsoftech 90B trainer does not model it (SWR and KAPA
procedure fixes entered, no page). The maintainer ruled that, with both trainers silent, the separator and the
copy behavior follow from the model chosen above; keeping the flag over a power cycle is the maintainer's choice. The implementation adds a dated block for this check to
`docs/kln89-trainer-record.md`.

## Left to the builder (my calls, marked as such)

- **CLR on the type page:** ends the insert as CLR on the waypoint approval does (4-2 step 7): nothing is inserted and
  the position is blank again.
- **Page name and class:** a new left page class pushed over the flight plan page, in the way `DuplicateWaypointPage`
  is; its 5-character `name` and how it handles the inner knob are the builder's choice.
- **Input during the airport load:** the entry waits for the load before the page or the insert; keys arriving
  meanwhile must not insert the leg twice.
- **Tests:** at the cheapest stage that observes them: the question appears only for a terminal fix flown over in a
  SID/STAR of its airport; the SID/STAR answer sets `flyOver` and the en-route answer does not; `Use?` keeps the flag;
  no question for EFB legs; a save and restore keeps the flags; a plain V2 string still loads; a trailer with a wrong
  count is ignored; a dropped waypoint does not shift the flags of the legs after it.
