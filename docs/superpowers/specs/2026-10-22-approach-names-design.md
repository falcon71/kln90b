# Approach names on APT 8 (#60): design

Date: 2026-10-22. Status: approved by the maintainer on the date it was committed.

## Intent

The RNAV Y 32L approach will be flown in a tutorial flight of the KLN. APT 8 shows it as `RNAV-Y32L`. That is nine
characters in a field of eight, so it is cut off. The real unit shows no suffix for an approach that has a runway, so the
suffix goes away there (#60). The same check found more names the unit uses that the code lacks (GPS, VOR/DME, the
runway-less forms), and those are added in the same change. The list formatter moves out of the page so that it can be
unit-tested.

## The names

Two names, both static methods of `SidStar` (the approach chosen in the conversation):

- **List name**, `SidStar.formatApproachListName(app)`, new. Always 8 characters: the APT 8 list puts it after the
  number (`" 1 "`).
- **Header**, `SidStar.formatApproachName(app, facility)`, existing. The first row of the IAF, preview, add and replace
  pages, and the procedure header in the flight plan (`displayName`).

**An approach with a runway never shows its suffix**, in either name. The type word is padded to 5 characters and the
runway to 3 in the list; the header is a letter, the runway, a dash and the airport.

| Type                | List       | Header      |
|---------------------|------------|-------------|
| RNAV                | `RNAV 35L` | `R35L-KRNO` |
| GPS                 | `GPS  27`  | `G27-KXXX`  |
| VOR                 | `VOR  25R` | `V25R-KXXX` |
| VOR/DME             | `VORD 12`  | `D12-KXXX`  |
| NDB and NDB/DME     | `NDB  24L` | `N24L-KXXX` |

**An approach without a runway keeps its suffix.** Both names share one runway-less name, made by one private helper so
that they cannot drift apart. The list pads it to 8; the header adds a dash and the airport.

| Type                | List and header name | Header       |
|---------------------|----------------------|--------------|
| VOR and VOR/DME     | `VOR-A`              | `VOR-A-KAAS` |
| NDB and NDB/DME     | `NDB-B`              | `NDB-B-KXXX` |
| RNAV                | `RNVA` (no dash)     | `RNVA-KTRK`  |
| GPS                 | `GPSA` (no dash)     | `GPSA-KXXX`  |

The unit has no space for a 6-character runway-less name, so VOR/DME falls back to VOR there and the `D` appears only for
an approach tied to a runway. Runway-less VOR/DME and RNAV approaches exist in current real-world navdata, so these
cases are reachable.

Two approaches that differ only in their suffix (KSMO RNAV 03 Y and Z) get the same names, so the pilot cannot tell
them apart. Nobody knows what the real unit shows for such a pair. This is only what the rule above produces, a guess
with no evidence behind it, and the test pins it as such.

Types that `SidStar.isApproachRecognized` rejects still throw, as today.

## Evidence, and how the tests label it

The maintainer's rule: anything not from a truly reliable source is a characterization, and every test names its exact
source so that a new source that conflicts can be weighed against it later.

- **Real unit, spec tests.** Photo `krno-iap-list.jpg` (maintainer's `gps search` folder): KRNO APT 8 lists RNAV 17L, 17R,
  35L and 35R. These are the X approaches; the other KRNO RNAV approaches are filtered out (`isApproachRecognized`).
  Photo `krno-r35l-list.jpg`: the header `R35L-KRNO`. The unit tests build these four KRNO approaches with suffix X.
- **AVsoftech KLN 90B trainer, characterization tests** (checked by the maintainer, 2026-10-22; `test/README.md` does
  not count this trainer as evidence): the list names `GPS` and `VORD`, the header letters `G` and `D`, KAAS `VOR-A`
  and `VOR-A-KAAS` (a runway-less VOR/DME), KTRK `RNVA` and `RNVA-KTRK`, and `NDB-B`.
- **No source, characterization tests:** `GPSA` (by analogy with `RNVA`; no runway-less GPS approach is in the
  trainer's database), NDB/DME grouped with NDB (maintainer's ruling), and KSMO RNAV 03 Y and Z both shown as
  `RNAV 03` and `R03-KSMO`.
- **The Pilot's Guide** stays behind the existing spec tests: figures 6-8 (`V25R-KLAX`) and 6-24 (`V12-KOWA`, a VOR
  RWY 12 approach) for the header, 3-49 figure 3-149 for `VOR-A` in the list. The existing test that names a VOR/DME
  12 approach `V12` (claiming figure 6-24) changes to `D12` and becomes a trainer characterization, because the figure
  shows a VOR approach, not a VOR/DME one.

## Comments asked for

- `Apt7Page`: the "impossible not to select a transition" comment gets its evidence. In the AVsoftech KLN 90B trainer
  (2026-10-22) the STAR CHINS 5 cannot be loaded with CHINS itself as its transition: when a STAR has transitions, one
  must be selected.
- `Apt8Page`: photo `krno-r35l-list.jpg` of a real unit shows that only IAFs can be selected, so an approach cannot be
  started at the IF.

## Non-goals

- No change to which approaches are recognized, to the EFB route sync (it reads `approachSuffix`, not the name) or to
  persisted data (`displayName` is not saved).
- No way for the pilot to tell KSMO RNAV 03 Y and Z apart.

## Left to the builder (Claude's calls)

- A runway-less approach with an empty suffix: the name is the type word alone (`VOR`, `NDB`, `RNV`, `GPS`), pinned as
  a characterization with no source.
- The existing render tests that pin old forms (`V-A-KPRC` in `Apt8Page.test.ts`) are updated to the new ones.
- Test facilities carry the real idents KRNO, KSMO, KAAS and KTRK because the evidence names them. Their positions and
  legs stay invented, and nothing is copied from navdata.
- One commit, `fixes #60 …`, holding the code, the tests, the comments and this design.
