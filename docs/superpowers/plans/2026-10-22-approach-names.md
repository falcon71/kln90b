# Approach names on APT 8 (#60) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APT 8 and the approach header drop the suffix of an approach that has a runway, and gain the GPS, VOR/DME and
runway-less names, with the list formatter moved into `SidStar` and unit-tested.

**Architecture:** A new static `SidStar.formatApproachListName(app)` (8 characters) sits beside the existing
`SidStar.formatApproachName(app, facility)` (header). One private static helper makes the runway-less name both use.
`Apt8IAPPage` loses its private formatter and calls the new static.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk` (`ApproachProcedure`, `RunwayUtils`, the `ApproachType` global),
Vitest (unit and render stages).

**Spec:** `docs/superpowers/specs/2026-10-22-approach-names-design.md`

## Global Constraints

- Branch `issue-60-approach-names`; one commit, `fixes #60 …`, holding code, tests, comments, the design and this plan.
- Every test names its exact source. Real-unit photos → spec test. The AVsoftech KLN 90B trainer, checked by the
  maintainer on 2026-10-22, or no source → the word `characterization` in the `describe`/`it` title, with the source in
  a comment ("AVsoftech KLN 90B trainer, 2026-10-22, KAAS" / "no source"). A characterization carries no manual page.
- The KSMO pair is a guess with no evidence; its comment must say so and must not sound confident.
- Never copy manual text or navdata into the repo. Test facility positions and legs are invented; only the idents KRNO,
  KSMO, KAAS, KTRK are real.
- American English; no counts of growing collections in comments.

## Review Focus

- Every list name is exactly 8 characters, including runway-less names and runways below 10 → each list assertion is
  an exact string literal (trailing spaces included), never `trim()` or `toContain`.
- The header for a runway-less approach must not regress to the old letter form (`V-A-KPRC`) anywhere it is shown → the
  render test at `Apt8Page.test.ts:1113` asserts `VOR-A-KPRC`.
- The flight-plan header (`displayName`) follows the new rule → `SidStar.test.ts:1017` asserts `R27L-KPRC`.
- The page actually uses the new formatter → the `iapWorld()` RNAV 18 approach gets suffix `Y`, so the existing render
  pins of `' 1 RNAV 18'` prove the drop through the page.
- A VOR/DME and an NDB/DME without a runway fall back to the plain type word → own characterization cases.

---

### Task 1: Approach names (#60)

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts:93-122` (`formatApproachName`, new `formatApproachListName`, private helper)
- Modify: `kln90b/pages/right/Apt8Page.tsx:39-43` (comment), `:398` (call), `:440-471` (delete private formatter; drop
  the `RunwayUtils` import if nothing else uses it)
- Modify: `kln90b/pages/right/Apt7Page.tsx:49-53` (comment)
- Test: `test/unit/data/navdata/SidStar.test.ts:951-986` (replace the block), `:1017`
- Test: `test/render/pages/right/Apt8Page.test.ts:747-748` (suffix `Y`), `:1113-1121`

**Interfaces:**
- Produces: `SidStar.formatApproachListName(app: ApproachProcedure): string` (always 8 characters) and the changed
  `SidStar.formatApproachName(app: ApproachProcedure, facility: AirportFacility): string`.

The names (from the spec):

| Type            | List, runway | Header, runway | Runway-less name |
|-----------------|--------------|----------------|------------------|
| RNAV            | `RNAV`       | `R`            | `RNV` + suffix   |
| GPS             | `GPS`        | `G`            | `GPS` + suffix   |
| VOR             | `VOR`        | `V`            | `VOR-` + suffix  |
| VOR/DME         | `VORD`       | `D`            | `VOR-` + suffix  |
| NDB, NDB/DME    | `NDB`        | `N`            | `NDB-` + suffix  |

- With a runway, the suffix is never shown. List: type word `padEnd(5)` + runway `padEnd(3)`. Header: letter + runway
  (`RunwayUtils.getRunwayNameString(app.runwayNumber, app.runwayDesignator, true)`) + `-` + ident.
- Without a runway (`app.runway === ""`). List: the runway-less name `padEnd(8)`. Header: runway-less name + `-` +
  ident. An empty suffix gives the type word alone, without dash (`VOR`, `NDB`, `RNV`, `GPS`).
- Other types throw, as today.

- [ ] **Step 1: Write the failing unit tests**

Replace `describe('SidStar.formatApproachName', …)` in `test/unit/data/navdata/SidStar.test.ts` with a block that uses
these helpers (`airport`, `approach`, `Leg`, `fafaa`, `kprc` already exist in the file):

```ts
const RNAV = ApproachType.APPROACH_TYPE_RNAV, GPS = ApproachType.APPROACH_TYPE_GPS, VOR = ApproachType.APPROACH_TYPE_VOR,
    VORDME = ApproachType.APPROACH_TYPE_VORDME, NDB = ApproachType.APPROACH_TYPE_NDB, NDBDME = ApproachType.APPROACH_TYPE_NDBDME;
const app = (type: ApproachType, runway: string, suffix?: string) => approach({type, runway, suffix, final: [Leg.IF(fafaa)]});
const listName = (type: ApproachType, runway: string, suffix?: string) => SidStar.formatApproachListName(app(type, runway, suffix));
const header = (type: ApproachType, runway: string, suffix?: string, apt = kprc) => SidStar.formatApproachName(app(type, runway, suffix), apt);
// Invented positions; the idents are the airports the evidence names
const krno = airport('KRNO', 39.5, -119.8), ksmo = airport('KSMO', 34.0, -118.5),
    kaas = airport('KAAS', 46.0, -100.0), ktrk = airport('KTRK', 39.3, -120.1);
```

Spec tests (real unit and manual), each with its source in a comment:
- `krno-iap-list.jpg` (photo of a real unit, maintainer's `gps search` folder): KRNO lists its RNAV approaches without
  their suffix. `['17L','17R','35L','35R'].map(r => listName(RNAV, r, 'X'))` equals
  `['RNAV 17L', 'RNAV 17R', 'RNAV 35L', 'RNAV 35R']`. Comment: these are the X approaches, the only ones the unit can fly;
  the others are filtered out and the suffix is not shown.
- `krno-r35l-list.jpg`: `header(RNAV, '35L', 'X', krno)` is `'R35L-KRNO'`.
- 6-5, figures 6-8 and 6-24 (keep the existing citation): `header(VOR, '25R')` `'V25R-KPRC'`, `header(NDB, '24L')`
  `'N24L-KPRC'`, `header(RNAV, '15C')` `'R15C-KPRC'`. Drop the VOR/DME 12 and NDB/DME 33 rows from this block; the
  comment notes that figure 6-24 is a VOR RWY 12 approach.
- 3-49, figure 3-149: `listName(VOR, '', 'A')` is `'VOR-A   '`.

`describe('… (characterization)')`, AVsoftech KLN 90B trainer, 2026-10-22 (comment: third-party, not counted as
evidence by `test/README.md`):
- GPS: `listName(GPS, '27')` `'GPS  27 '`, `header(GPS, '27')` `'G27-KPRC'`.
- VOR/DME: `listName(VORDME, '12')` `'VORD 12 '`, `header(VORDME, '12')` `'D12-KPRC'`.
- KAAS VOR/DME-A: `listName(VORDME, '', 'A')` `'VOR-A   '`, `header(VORDME, '', 'A', kaas)` `'VOR-A-KAAS'`.
- KTRK RNAV-A: `listName(RNAV, '', 'A')` `'RNVA    '`, `header(RNAV, '', 'A', ktrk)` `'RNVA-KTRK'`.
- NDB-B: `listName(NDB, '', 'B')` `'NDB-B   '`; `header(NDB, '', 'B')` `'NDB-B-KPRC'` (comment: the header by analogy
  with `VOR-A-KAAS`).
- Keep `header(VOR, '09')` `'V09-KPRC'` and add `listName(VOR, '09')` `'VOR  09 '` (comment: no source for the zero).

`describe('… (characterization)')`, no source:
- `GPSA`: `listName(GPS, '', 'A')` `'GPSA    '`, `header(GPS, '', 'A')` `'GPSA-KPRC'` (by analogy with `RNVA`; no
  runway-less GPS approach is in the trainer's database).
- NDB/DME grouped with NDB (maintainer's ruling, #60): `listName(NDBDME, '33')` `'NDB  33 '`, `header(NDBDME, '33')`
  `'N33-KPRC'`, `listName(NDBDME, '', 'C')` `'NDB-C   '`.
- KSMO RNAV 03 Y and Z: `[listName(RNAV, '03', 'Y'), listName(RNAV, '03', 'Z')]` equals `['RNAV 03 ', 'RNAV 03 ']`;
  `header(RNAV, '03', 'Y', ksmo)` and `…'Z'…` both `'R03-KSMO'`. Comment: nobody knows what the real unit shows for such
  a pair; this is only what the rule produces, a guess with no evidence, and the pilot cannot tell the two apart.
- Empty suffix, no runway: `listName(VOR, '')` `'VOR     '`, `header(VOR, '')` `'VOR-KPRC'`, `listName(RNAV, '')`
  `'RNV     '`.

Also change `SidStar.test.ts:1017` to `'R27L-KPRC'` and add to its comment that an approach with a runway shows no
suffix (`krno-r35l-list.jpg`).

- [ ] **Step 2: Run the unit tests and see them fail**

Run: `npx vitest run test/unit/data/navdata/SidStar.test.ts`
Expected: FAIL; `formatApproachListName` is not a function, and the header cases with GPS, VOR/DME, a suffix or no
runway differ.

- [ ] **Step 3: Implement the names in `kln90b/data/navdata/SidStar.ts`**

`formatApproachListName(app)` and the changed `formatApproachName(app, facility)` per the table above; the runway-less
name in one private static helper both call. Keep `//Figure 6-18, no padding with spaces in the name` on the header and
cite `krno-iap-list.jpg` / `krno-r35l-list.jpg` and the trainer for the forms they back, as the tests do.

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `npx vitest run test/unit/data/navdata/SidStar.test.ts`
Expected: PASS

- [ ] **Step 5: Switch the page and update the render tests**

- `Apt8Page.tsx:398`: `SidStar.formatApproachListName(app)`; delete the private `formatApproachName`.
- `Apt8Page.test.ts` `iapWorld()`: the RNAV 18 approach gets `suffix: 'Y'`, with the comment that the list and header
  must not show it (#60). The existing `' 1 RNAV 18'` expectations stay unchanged.
- `Apt8Page.test.ts:1113`: title `titles a circling approach with its name, a dash and the airport`, expectation
  `'VOR-A-KPRC'`, comment: AVsoftech KLN 90B trainer, 2026-10-22, KAAS showed `VOR-A-KAAS`.

- [ ] **Step 6: Add the two comments**

- `Apt7Page.tsx` class comment: keep the "impossible not to select" line (worded for a transition) and add that in the
  AVsoftech KLN 90B trainer (2026-10-22) the STAR CHINS 5 does not offer CHINS itself as a transition: when a STAR has
  transitions, one must be selected.
- `Apt8Page.tsx` class comment: add that a photo of a real unit (`krno-r35l-list.jpg`) lists only the IAFs of
  R35L-KRNO, so only an IAF can be selected and an approach cannot be started at the IF.

- [ ] **Step 7: Run every check**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run build`
Expected: tsc clean; all tests pass; the build ends without new errors (the known circular-dependency and Sass
warnings stay).

- [ ] **Step 8: Commit**

```bash
git add kln90b/data/navdata/SidStar.ts kln90b/pages/right/Apt8Page.tsx kln90b/pages/right/Apt7Page.tsx \
  test/unit/data/navdata/SidStar.test.ts test/render/pages/right/Apt8Page.test.ts \
  docs/superpowers/specs/2026-10-22-approach-names-design.md docs/superpowers/plans/2026-10-22-approach-names.md
git commit -m "fixes #60 drop the suffix of an approach with a runway and add the GPS, VOR/DME and runway-less names"
```
(with the `Co-Authored-By` line).
