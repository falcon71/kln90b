import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {intersection, ndb, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {distanceNm} from '../../../harness/flight/geo';

/**
 * Five waypoints named ABD of three types in five countries (by their ICAO regions, Appendix D), at increasing distance
 * from the aircraft at 47 N 8 E: about 18, 72, 92, 135 and 170 NM. The order is checked with geo.ts in the setup
 */
const POSITION = {lat: 47.0, lon: 8.0};
const abdChe = vor('ABD', 47.3, 8.1, {region: 'LS'});
const abdFra = ndb('ABD', 48.0, 7.0, {region: 'LF'});
const abdDeu = vor('ABD', 48.5, 8.5, {region: 'ED'});
const abdIta = ndb('ABD', 45.0, 9.5, {region: 'LI'});
const abdAut = intersection('ABD', 49.5, 10.0, {region: 'LO'});

/** D->, ABD typed with the knobs and ENT: the Duplicate Waypoint page opens on the left */
async function duplicatePage(facilities = [abdChe, abdFra, abdDeu, abdIta, abdAut]): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: POSITION});
    await settle(unit);
    await unit.panel.dct();
    await unit.panel.enterIdent('L', 'ABD');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(500);
    return unit;
}

/** A waypoint line: its number, type, country and the question mark */
const isItem = (row: string) => /^ ?\d+ [A-Z]{3} .{3}\?$/.test(row);
/** The waypoint lines of the page, wherever they are, with their spaces collapsed */
const items = (rows: string[]) => rows.filter(isItem).map(r => r.trim().replace(/ +/g, ' '));

describe('DUPLICATE WAYPOINT page (characterization)', () => {
    // Four waypoints, so that the number of visible lines does not matter; the line positions are left out, because the
    // page has no header line (#258, pinned below)
    it('lists the waypoints with the cursor on the first (characterization)', async () => {
        await duplicatePage([abdChe, abdFra, abdDeu, abdIta]);

        const screen = Screen.read();
        const rows = screen.rows('L');
        const masks = screen.maskRows('L');
        const lines = rows.map((r, i) => `${r}|${masks[i]}`).filter((l, i) => i === 0 || isItem(rows[i]));
        expect(lines.join('\n')).toMatchInlineSnapshot(`
          " ABD      4|...........
           1 VOR CHE?|IIIIIIIIIII
           2 NDB FRA?|...........
           3 VOR DEU?|...........
           4 NDB ITA?|..........."
        `);
    });
});

describe('DUPLICATE WAYPOINT page (spec)', () => {
    // The precondition of the 3-15 order below, from geo.ts and not from the unit
    it('the world: the five ABD lie at increasing distance from the aircraft (precondition of 3-15)', () => {
        const d = [abdChe, abdFra, abdDeu, abdIta, abdAut].map(f => distanceNm(POSITION, f));
        expect([...d].sort((a, b) => a - b)).toEqual(d);
    });

    // 3-15: the page shows the identifier at the top left and, to its right, how many waypoints have it
    it('shows the identifier and the number of waypoints that have it (3-15)', async () => {
        await duplicatePage();

        expect(Screen.read().rows('L')[0].trim().split(/ +/)).toEqual(['ABD', '5']);
    });

    // 3-15, figure 3-52: below the identifier, the waypoints are numbered and listed with their type and country, the
    // closest to the aircraft first; at most four are visible
    it('lists the waypoints closest first, with number, type and country (3-15)', async () => {
        await duplicatePage();

        expect(items(Screen.read().rows('L')).slice(0, 4)).toEqual(['1 VOR CHE?', '2 NDB FRA?', '3 VOR DEU?', '4 NDB ITA?']);
    });

    // 3-15 step 3: the cursor starts on the first waypoint and the left outer knob moves it down the list to the others
    // (figure 3-53). Whether the first one scrolls out depends on the four visible lines, which #258 pins
    it('starts the cursor on the first waypoint and moves it to the fifth with the outer knob (3-15)', async () => {
        const unit = await duplicatePage();
        expect(unit.panel.focused('L').text.trim()).toBe('1 VOR CHE?');

        await unit.panel.outer('L', 4);

        expect(unit.panel.focused('L').text.trim()).toBe('5 INT AUT?');
    });

    // 3-15 steps 4 and 5: ENT on a waypoint shows its waypoint page on the right, with the identifier back on the
    // Direct To page (figure 3-54); ENT again approves it, and the unit flies direct to that waypoint, not to the closest
    it('shows the selected waypoint and makes it the Direct To waypoint with two ENT (3-15)', async () => {
        const unit = await duplicatePage();
        await unit.panel.outer('L', 1); // The NDB in France

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        const screen = Screen.read();
        expect(screen.rows('L')[0]).toBe('DIRECT TO: ');
        expect(screen.rows('L')[2]).toBe('   ABD     ');
        expect(screen.status().right).toBe('NDB');
        expect(screen.rows('R')[4]).toBe("N 48°00.00'");

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        const active = unit.props.memory.navPage.activeWaypoint.getActiveWpt()!;
        expect([active.icaoStruct.ident, active.lat, active.lon]).toEqual(['ABD', 48.0, 7.0]);
        expect(unit.errors).toEqual([]);
    });
});

// 3-15, figures 3-52 and 3-53: the line below the identifier is the header TYPE AREA, and four waypoints follow in rows
// 2 to 5. The page has no header, and its list starts in row 1 with five lines (List's default height)
describe('DUPLICATE WAYPOINT page layout', () => {
    it('five waypoints named ABD open the page with the count 5 (3-15)', async () => {
        await duplicatePage();

        expect(Screen.read().rows('L')[0].trim().split(/ +/)).toEqual(['ABD', '5']);
        expect(items(Screen.read().rows('L'))[0]).toBe('1 VOR CHE?');
    });

    it.fails('shows the header TYPE AREA in row 1 and four waypoints in rows 2 to 5 (3-15, checked in the KLN 89 trainer, 2026-10-07, #258)', async () => {
        await duplicatePage();

        const rows = Screen.read().rows('L');
        expect(rows[1].trim()).toBe('TYPE AREA');
        expect(rows.slice(2).map(r => r.trim().replace(/ +/g, ' '))).toEqual(['1 VOR CHE?', '2 NDB FRA?', '3 VOR DEU?', '4 NDB ITA?']);
    });
});
