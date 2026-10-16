# Nearest lists, scan lists and database pages: design

Date: 2026-10-16. Milestone 6. Issues: #95, #105, #128, #201, #202, #203, #204, #206, #207, #265, #268, #270, #342.
Branch: `m6-nearest-scan`.

The milestone held eleven bugs and two questions (#207, #270). A read-only inventory measured every candidate fix
against the full suite, and a trainer agent checked the third-party AVsoftech KLN 90B trainer and the KLN 89 trainer.
The inventory also found #387 (accented letters dropped from names); the maintainer closed it as not planned because
the database has no accented letters, and `Text.ts` now says so (a45040b).

## 1. Evidence

**Maintainer rulings (2026-10-16).**
- #207: the nearest APT, VOR and NDB lists search a **200 NM** circle (the KLN 89's radius, within the range the
  AVsoftech trainer shows). The INT/SUP reference VOR follows the KLN 89 trainer's limit, 1000 NM (section 4E).
- #270: macadam counts as HRD, on APT 3 and in the SET 3 surface filter of the nearest airport list (the inventory's
  finding that SET 3 leaves macadam out is folded into #270).
- #206 with #204: a user VOR is never the NAV 2 VOR; NAV 2 keeps its low/high rule.
- #265: the whole 3-26 rule set as far as it can be implemented, in a new class of its own with unit tests.
- #342: the country comes from `facility.region`; an empty or unknown region, user airports (`XX`) included, gives
  three blanks.
- Sections 2 to 6 were approved in chat.

**AVsoftech KLN 90B trainer, 2026-10-16** (third-party, unreliable; agent report in the session scratchpad
`trainer/report.md`).
- The nearest airport list reached Bermuda (TXKF) from 186.8 NM east but not from 189.3 NM east, and from 217.1 NM
  north but not from about 218 NM north. Both edges sit on whole-degree lines, as if the search covered a block of 7 by
  7 one-degree cells around the aircraft. The VOR and NDB lists reached as far (BDA and BSD at about 217 NM).
- With nothing in range the unit kept the old list with growing distances and showed no message; unused slots repeated
  an entry. Not used: an artefact of that trainer.
- The SUP page named BDA as the reference at 136, 190 and about 1245 NM (the distance dashed at 1000 NM and more);
  NAV 2 showed BDA at 136.5 NM.
- APT 1 showed `WESTCHESTER` / `CO` for KHPN: WEST inside a word stays whole.

**KLN 89 trainer, 2026-10-07** (in `docs/kln89-trainer-record.md`): the nearest airport list stops at 200 NM (#207);
with the cursor on the rank the page follows the new nearest airport (#268); a scan from a typed ident without a
waypoint goes from the last waypoint the entry matched (#202).

**KLN 89 trainer, 2026-10-16** (recorded in `docs/kln89-trainer-record.md`). High confidence, one direction tested.
The USR page named the closest VOR (IMT) as the reference up to 999.7 NM and showed dashes for Ref, Rad and Dis from
about 1000.7 NM; the maintainer's own waypoint near the South Pole shows the same dashes. The edge coincides with the
end of the three-digit distance field.

**Pilot's Guide.** 3-8 and 3-32 (NAV 2: the nearest low or high VOR; the DME-arc exception), 3-15 (Duplicate
Waypoint page: type and country), 3-21 (scanning in alphabetical order), 3-22 to 3-24 (nine nearest; SET 3 criteria;
the cursor parked on NR 1), 3-26 (name changes: only names too long for the display are shortened; the first word is
usually kept unless longer than eight characters; the listed short forms and deleted words; punctuation goes), 3-37
(Super NAV 5 VOR classes), 3-44 (APT 3 surfaces), 3-49 and 3-50 (VOR page; INT reference VOR), 5-45 (nearest functions
include user waypoints).

**SDK.** `@microsoft/msfs-sdk` 2.3.3 declares `region: string` on `Facility`. `RunwayUtils.getSurfaceCategory` counts
Macadam as hard. `FacilityLoader.searchByIdent*` passes `maxItems` unchanged to the sim; whether the sim honors it, and
which entries it keeps when it cuts, is unknown.

**Inventory (2026-10-16).** Read-only, detached worktrees at aca297a; report and patches in the session scratchpad
`inventory/`. Baseline: 4137 tests (4071 pass, 66 expected fails), `tsc` clean. All candidate fixes together turn the 19
pins red and change exactly 9 other tests (the vehicles named below); the effects add up.

## 2. Scan list (#105, #203, #201)

All in `kln90b/data/navdata/Scanlist.ts`, tested in `test/unit/data/navdata/Scanlist.test.ts`, in this order.

**A. The index in list order (#105).** The index entry of each starting character is the first entry of that
character in list order (ident, then full ICAO, the cache's comparator): search the character's first ident again with
enough results, keep the exact-ident matches, sort, take the first. The very last entry (the top-speed jump) is the
last in list order and is found without relying on a 1000-result cap (descend into longer prefixes while a result may
be cut, as in 2C). Vehicle: `test/render/harness/enterIdent.test.ts:104` expects the fresh VOR page on the K2 entry (the
bug itself) and gets another way to tell a search from none.

**B. The shorter ident in the backward refill (#203).** After a prefix that ends in `0` (`AB0`), the backward refill
searches the shorter ident itself as an exact ident (`AB`) before the prefix in front of it (`AA`). An exact-ident
search never counts as cut. The #108 fix and its tests stay.

**C. The cache window (#201).** Correct whether or not the sim honors `maxItems`:
- every refill asks for one fixed search size; a result that fills it may be cut, so its prefix is not marked as
  cached and the walk goes on with the longer prefixes (forward: keep the exact-ident entries, then `prefix + '0'`;
  backward: `prefix + 'Z'`); a five-character prefix is never cut;
- the upper cache bound becomes exclusive (`null` = to the end); the `"ZZZZ"` sentinel goes;
- both prunes cut between two different idents and keep the entry at the edge (the end prune had the same defect);
- the cache drops duplicates by ICAO uid, not by object identity (the sim returns new objects for every search).
Vehicles: the three #117 tests (`Scanlist.test.ts:140-167`, `:188-207`) sync to waypoints that are already cached and
relied on wasted searches; they sync to uncached waypoints instead. A trimmed copy of the inventory's stress test stays
as a unit test: some 3000 idents with prefix chains and duplicates, scanned both ways and after a user waypoint change,
over fakes that honor `maxItems`, ignore it, and return fresh ICAO objects (options of
`test/harness/navdata/MemoryFacilityClient.ts`). Spec: 3-21.

## 3. Waypoint page (#202, #268, #265)

**A. Scan from the last match (#202).** `WaypointPageState` (`VolatileMemory`) gets `lastMatch`, initialized with the
other fields and cleared in `VolatileMemory.reset`. When typed text replaces a shown facility, the facility in the page
memory becomes the last match (nested pages call `changeFacility` twice, so the memory decides); a facility clears it.
A scan with no facility starts from the last match, else from the typed ident; for that case `Scanlist.findClosest`
returns the entry after the typed ident clockwise, not the first one before it. Spec: 3-21 and the KLN 89 check of
2026-10-07.

**B. The cursor parked on the rank (#268).** While the cursor is on the rank, the page holds the rank and shows the
waypoint at that rank (or the last one, if the list got shorter) on every tick; a scan while parked moves the rank.
The rank is a page field: the cursor does not survive a page recreation. The same code serves every nearest page (APT,
VOR, NDB). Spec: 3-24 and the KLN 89 check of 2026-10-07.

**C. Airport names (#265).** A new class `AirportNameFormatter` (`kln90b/data/AirportNameFormatter.ts`) takes the translated
name and returns the text APT 1 shows; `Apt1Page` keeps only the split into its two rows of 11. Rules, per 3-26:
- the name is first brought into the unit's character set (`convertTextToKLNCharset`), and runs of blanks collapse;
- a name that fits the two rows (22 characters) is shown as it is;
- a longer name: the listed words become their short forms (the compass words, POINT, PORT, FORT, SAINT, GENERAL,
  INTERNATIONAL as INT, REGIONAL as REG), each as a whole word and at every occurrence; CITY OF, GREATER and THE are
  deleted; the first word keeps its spelling unless it is longer than eight characters (the deletions apply to it too,
  as the guide's own examples show); blanks are collapsed and the result trimmed;
- the person's-initials rule cannot be implemented (no way to tell a person's name) and is left out.
Unit tests on the class; the four render pins in `Apt1Page.test.ts` turn into spec tests. The spec row `FORT SMITH
REGIONAL` (19 characters, it fits) now shows the name whole. Vehicle:
`test/render/controls/AirportCoordOrNearestView.test.ts:54` snapshots the harness default name and gets an explicit
one. Which short forms apply and in which order, and the whole-name application once a name is too long, are
characterizations; the KHPN row of the AVsoftech check supports the whole-word rule.

## 4. Nearest lists and the VOR reference (#95, #128, #204, #206, #207, #270)

**A. A failed search (#95).** `NearestList.tick` runs its search inside `try`/`finally`, so `isCalculating` is always
reset. `TickController.tickCalc` attaches a `.catch` to a returned promise and reports the error like a synchronous
one (the error page); `CalcTickable.tick` stays `void`. The facilities a search added load one by one: one that cannot
load is left out and the rest are listed (today one failure loses the whole batch for good). The removal loop no longer
splices inside a forward loop.

**B. The repository VOR filter (#128).** The filter compares `BitFlags.createFlag(f.vorClass)` and
`createFlag(f.type)` with the masks. Test: a repository VOR of class LowAlt and type VOR is listed (the issue thought no
input could show it; one can).

**C. All VOR classes in the list; NAV 2 keeps low/high (#204).** The shared VOR nearest list takes the classes
terminal, low, high and undefined. NAV 2 gets its nearest VOR from a nearest list of its own with the low/high mask, so
a low or high VOR behind nine nearer terminal VORs is still found; the DME-arc exception of 3-32 still comes first.
Super NAV 5 filters TLH/LH/H from the shared list as today. Spec: 3-8, 3-32, 3-37, 3-49.

**D. User VORs (#206).** The repository filter accepts VORs of class and type Unknown (every user VOR). With 4C a user
VOR is in the VOR nearest list, drawn on Super NAV 5 with TLH, and never on NAV 2. `NearestUtils.getNearestVor` keeps
the results of its search session (applying `removed` and `added`) and returns the one nearest to the asked position;
calls are serialized, because CTR 1, INT and SUP can call it concurrently and the session's diffs must apply in order.
The result cache is a mirror of the SDK session and stays beside it in `NearestUtils`, like the nearest lists
themselves. Spec: 3-50, 5-45.

**E. The radii (#207).** The nearest lists search 200 NM (ruling; the KLN 89 guide and trainer). The reference VOR
search of INT, SUP and CTR 1 searches 1000 NM (the KLN 89 trainer of 2026-10-16); a waypoint with no VOR within it
shows dashes for the reference, radial and distance, as today when the search finds nothing. The characterization at
`test/render/data/navdata/NearestList.test.ts:276-283` (450 NM) becomes a test of the 200 NM edge (an airport just
inside is listed, one just outside is not); the reference radius gets the same pair of tests on the INT page. Both
numbers are characterizations for the 90B: the 90B guide gives neither, and the 89 check sees one direction only.

**F. Macadam (#270).** `Apt3ListPage.getKLNSurfaceString` maps Macadam to `HRD`, and both SET 3 surface masks of
`AirportNearestList.getSurfaceMask` include it. The characterization `Apt3Page.test.ts:79` becomes a spec test; the
unit table of `test/unit/pages/right/Apt3ListPage.test.ts` lists Macadam as HRD and drops its exception. Spec: 3-44
(paved and sealed runways are hard) with the ruling; the macadam word itself is the maintainer's ruling.

## 5. Countries (#342)

`getCountry` (`kln90b/data/CountryMap.ts`) returns the country of `facility.region` for every facility type, or three
blanks for an empty or unknown region (`facility.region ?? ""` against a sim that leaves it out). The K rule and the
ident parsing go; APT 2's fallback (`getRegionOrCountry`) uses the same lookup. The harness builder gets a `region`
option (default K1). Tests: the maintainer's examples (`93F` in K4 is USA, `ETAR` in ED is Germany, `KIG` with an empty
region gives three blanks) and a user airport (XX) with three blanks. Vehicles: three characterizations in
`test/unit/data/CountryMap.test.ts` (`:18`, `:37`, `:81`) set their regions and become spec tests of the region rule.
Spec: 3-15.

## 6. Commits, lanes and testing

- One commit per issue, `fixes #NN <description>`, with its tests, its doc changes and its pin turned into a spec test
  (the `it.fails` becomes `it`, the name keeps its citation). The first commit records the trainer checks; the second
  is this design; the plan follows.
- A commit keeps the suite green: it updates the tests that used its bug as their vehicle and says so in the message.
- Lanes, each file with one owner, integrated linearly by cherry-pick onto `m6-nearest-scan`:
  - A, scan list: #105, #203, #201 (`Scanlist.ts`, `Scanlist.test.ts`, `enterIdent.test.ts`,
    `MemoryFacilityClient.ts`).
  - B, nearest lists: #95, #128, #204, #206, #207, #270 (`TickController.ts`, `NearestList.ts`, `KLNFacilityLoader.ts`,
    `NearestUtils.ts`, `Nav2Page.tsx`, `Apt3ListPage.tsx` and their tests, `NearestList.test.ts`, `IntPage.test.ts`).
  - C, waypoint page and names: #202, #268, #265, #342 (`WaypointPage.tsx`, `VolatileMemory.ts`, `Apt1Page.tsx`, the
    new formatter, `CountryMap.ts`, `builders.ts`, `Apt1Page.test.ts`, `CountryMap.test.ts`,
    `AirportCoordOrNearestView.test.ts`). Lane A's `findClosest` change for #202 is lane C's: `Scanlist.ts` is A's
    file, so C's #202 commit goes after A's commits.
- Each fix is tested at the cheapest stage that observes it. For every condition a fix adds, the plan names the test
  that goes red when that condition alone is dropped. Every implementer runs the full `npm test` and `npx tsc --noEmit`
  before committing and checks the suite for tests that depend on the bug it fixes.
- Labels: a citation supports only what its source shows. The KLN 89 checks cover the 89's behavior; the 90B's numbers
  and texts, anything on the 90B's second side, and every AVsoftech observation are characterizations. Comments cite
  page numbers and never copy manual text.
- Review verifies by mutation, then a final whole-branch review. Nothing is merged before the maintainer approves.
- **Public contract:** none of the interfaces in CLAUDE.md changes. The nearest lists' radius and the countries are
  visible behavior only.
