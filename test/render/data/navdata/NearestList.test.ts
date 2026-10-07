import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {RunwaySurfaceType, VorClass, VorType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, ndb, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {SuperNav5Page} from '../../../../kln90b/pages/left/SuperNav5Page';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {CoordinateCanvasDrawContext} from '../../../../kln90b/controls/Canvas';

// Invented airports on the meridian of the aircraft, 0.1 degrees (6 NM) apart, one of each kind the SET 3 criteria
// (3-22, 3-23) tell apart. The aircraft is at 47.0N 8.0E.
const POSITION = {lat: 47.0, lon: 8.0};
const heli = () => airport('HELI', 47.0, 8.0, {runways: []}); // nearest, no runway
const kshort = () => airport('KSHT', 47.1, 8.0, {runways: [{lengthFt: 800}]}); // below the default minimum length
const kaaa = () => airport('KAAA', 47.2, 8.0); // 5000 ft asphalt
const kgrs = () => airport('KGRS', 47.3, 8.0, {runways: [{lengthFt: 3500, surface: RunwaySurfaceType.Grass}]});
const kbbb = () => airport('KBBB', 47.4, 8.0);

/**
 * The nearest airports, in order, as APT 1 shows them: the emergency nearest function (3-23, MSG then ENT) shows nr 1,
 * the scan knob then walks the list. The nearest search runs every 10 s, so the clock advances first. The booted unit
 * has its boot messages, so MSG then ENT has an effect (as in Apt1Page.test.ts).
 */
async function nearestRows(unit: HeadlessUnit): Promise<string[]> {
    await vi.advanceTimersByTimeAsync(12000);
    await unit.panel.msg();
    await unit.panel.ent();
    const rows: string[] = [];
    let row = Screen.read().rows('R')[0];
    if (!row.includes(' nr ')) return rows;
    rows.push(row);
    await unit.panel.scan();
    for (let i = 0; i < 20; i++) {
        await unit.panel.inner('R', 1);
        row = Screen.read().rows('R')[0];
        if (!row.includes(' nr ')) break;
        rows.push(row);
    }
    return rows;
}

describe('the nearest airport list', () => {
    // 3-22, 3-23: the nearest list holds the nearest airports that meet the SET 3 runway criteria. A heliport has no
    // runway, so it cannot meet them (the implication of the criteria; #57 and the fix 531b0f9 are the other source).
    describe('heliports and the SET 3 criteria (#57, 531b0f9)', () => {
        it('leaves a heliport out of the list (#57)', async () => {
            const unit = await bootUnit({facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows).toEqual([' KAAA  nr 1', ' KGRS  nr 2', ' KBBB  nr 3']);
            expect(rows.join()).not.toContain('HELI');
        });

        // The runway of 800 ft is hidden by the minimum length criterion whatever the class mask does: this row
        // survives the #57 break by design and is no evidence for #57
        it('leaves out an airport whose runway is shorter than the minimum length', async () => {
            const unit = await bootUnit({facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows).toEqual([' KAAA  nr 1', ' KGRS  nr 2', ' KBBB  nr 3']);
            expect(rows.join()).not.toContain('KSHT');
        });

        it('lets a heliport take none of the nine slots (#57)', async () => {
            // The heliport is the nearest; ten ordinary airports follow, 0.1 degrees apart
            const ordinary = Array.from({length: 10}, (_, i) => airport(`KA0${i}`, 47.05 + i * 0.1, 8.0));
            const unit = await bootUnit({facilities: [heli(), ...ordinary], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows).toEqual([' KA00  nr 1', ' KA01  nr 2', ' KA02  nr 3', ' KA03  nr 4', ' KA04  nr 5', ' KA05  nr 6', ' KA06  nr 7', ' KA07  nr 8', ' KA08  nr 9']);
        });

        it('draws no heliport on Super NAV 5 (#57)', async () => {
            const labels: string[] = [];
            const spy = vi.spyOn(CoordinateCanvasDrawContext.prototype, 'drawLabel').mockImplementation((_facility, text) => {
                labels.push(text);
            });
            onTestFinished(() => spy.mockRestore());
            const unit = await bootUnit({storage: {superNav5Apt: true}, facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});
            await vi.advanceTimersByTimeAsync(12000);
            await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
            await unit.panel.selectPage('L', 'NAV 5');
            await unit.panel.inner('R', 1);
            await vi.advanceTimersByTimeAsync(2000);
            expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);

            expect([...new Set(labels)]).toEqual(['KAAA', 'KGRS', 'KBBB']);
        });
    });

    // 3-22, 3-23: SET 3 sets the minimum runway length and the surface of the airports in the nearest list
    describe('SET 3 criteria', () => {
        const kmid = () => airport('KMID', 47.1, 8.0, {runways: [{lengthFt: 1500}]});
        const world = () => ({facilities: [heli(), kmid(), kaaa(), kgrs(), kbbb()], position: POSITION});
        const idents = (rows: string[]) => rows.map(r => r.slice(1, 5));

        it('lists the airports of the default criteria', async () => {
            const unit = await bootUnit(world());

            expect(idents(await nearestRows(unit))).toEqual(['KMID', 'KAAA', 'KGRS', 'KBBB']);
        });

        // The runways of KLOW (1650 ft) and KHIG (1750 ft) lie either side of the selected 1700 ft
        it('drops an airport below the new minimum length', async () => {
            const klow = airport('KLOW', 47.15, 8.0, {runways: [{lengthFt: 1650}]});
            const khig = airport('KHIG', 47.25, 8.0, {runways: [{lengthFt: 1750}]});
            const unit = await bootUnit({facilities: [heli(), kmid(), klow, kaaa(), khig, kgrs(), kbbb()], position: POSITION});
            await unit.panel.selectPage('L', 'SET 3');
            await unit.panel.cursor('L');
            await unit.panel.inner('L', 7); // 1000 ft plus 7 steps of 100 ft
            expect(Screen.read().rows('L')[3]).toBe("      1700'");
            await unit.panel.cursor('L');
            await vi.advanceTimersByTimeAsync(2000);
            expect(storedSetting(unit, 'nearestAptMinRunwayLength')).toBe(1700);

            expect(idents(await nearestRows(unit))).toEqual(['KAAA', 'KHIG', 'KGRS', 'KBBB']);
        });

        it('drops the soft airport with the second surface option', async () => {
            const unit = await bootUnit(world());
            await unit.panel.selectPage('L', 'SET 3');
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 1);
            await unit.panel.inner('L', 1);
            await unit.panel.cursor('L');
            await vi.advanceTimersByTimeAsync(2000);
            expect(storedSetting(unit, 'nearestAptSurface')).toBe(false); // hard surface only

            expect(idents(await nearestRows(unit))).toEqual(['KMID', 'KAAA', 'KBBB']);
        });
    });
});

const identRow = () => Screen.read().rows('R')[0];

/**
 * One slow turn of the right inner knob: more than 350 ms after the last one, so the scan does not speed up
 * (WaypointPage SPEEDSTEP), and the scan's asynchronous search has finished when it returns.
 */
async function slowStep(unit: HeadlessUnit, clicks: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(400);
    await unit.panel.inner('R', clicks);
    await vi.advanceTimersByTimeAsync(400);
}

/**
 * The nearest list of the waypoint page shown on the right, nr 1 first: from the page's first waypoint of the complete
 * list, scanning counterclockwise walks the nearest list backwards (3-22). The nearest search runs every 10 s, so the
 * caller advances the clock first. The scan knob is left pulled out.
 */
async function nearestRowsBackwards(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.scan();
    const rows: string[] = [];
    for (let i = 0; i < 12; i++) {
        await slowStep(unit, -1);
        const row = identRow();
        if (!row.includes(' nr ') || rows.includes(row)) break;
        rows.push(row);
    }
    return rows.reverse();
}

// 3-22: the nearest list sits in front of the complete list. Counterclockwise from the start of the complete list
// reaches nr 9 (here the last of three), clockwise from the last nearest one reaches the start of the complete list, and
// neither end wraps. The NDB page has no nearest filter, which keeps the world small. ZZN is the default NDB, far away.
describe('the nearest list in front of the complete list (3-22)', () => {
    async function ndbPage(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [ndb('NBB', 47.2, 8.0), ndb('NAA', 47.1, 8.0), ndb('NCC', 47.3, 8.0)], position: POSITION});
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'NDB  ');
        expect(identRow()).toBe(' NAA       '); // precondition: the first waypoint of the complete list
        await unit.panel.scan();
        return unit;
    }

    it('scans counterclockwise from the start of the complete list to the last nearest waypoint', async () => {
        const unit = await ndbPage();

        await slowStep(unit, -1);

        expect(identRow()).toBe(' NCC   nr 3');
    });

    it('stays on nr 1 scanning counterclockwise', async () => {
        const unit = await ndbPage();
        await slowStep(unit, -1);
        await slowStep(unit, -1);
        await slowStep(unit, -1);
        expect(identRow()).toBe(' NAA   nr 1'); // precondition

        await slowStep(unit, -1);

        expect(identRow()).toBe(' NAA   nr 1');
    });

    it('scans clockwise from the last nearest waypoint to the start of the complete list', async () => {
        const unit = await ndbPage();
        await slowStep(unit, -1);

        await slowStep(unit, 1);

        expect(identRow()).toBe(' NAA       ');
    });

    it('stays on the last waypoint of the complete list scanning clockwise', async () => {
        const unit = await ndbPage();
        for (let i = 0; i < 3; i++) await slowStep(unit, 1);
        expect(identRow()).toBe(' ZZN       '); // precondition: the end of the complete list

        await slowStep(unit, 1);

        expect(identRow()).toBe(' ZZN       ');
    });
});

// 3-22: the nearest list holds the nine nearest waypoints to the present position
describe('the nearest NDB list follows the aircraft (3-22)', () => {
    // NAA 0.05 degrees (3.0 NM) north, NBB 0.1 degrees (6.0 NM) south of the start
    const world = () => ({facilities: [ndb('NAA', 47.05, 8.0), ndb('NBB', 46.9, 8.0)], position: POSITION});

    it('puts the nearer NDB first after the aircraft moved', async () => {
        const unit = await bootUnit(world());
        await vi.advanceTimersByTimeAsync(12000);
        // At 46.92 N NBB is 0.02 degrees (1.2 NM) away and NAA 0.13 degrees (7.8 NM)
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 46.92);
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'NDB  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' NBB   nr 1', ' NAA   nr 2']);
    });

    // The nearest search runs every 10 s and the first one ran within the first 12 s; the page step and the move fall
    // about 2 s after it, and the check 1.5 s later, well before the next search
    it('updates the distance on a nearest page within seconds, not only at the next search', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'NDB  ');
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.scan();
        await slowStep(unit, -1);
        expect(identRow()).toBe(' NBB   nr 2'); // precondition: the last nearest NDB, 6.0 NM south
        // 46.92 N is 0.02 degrees (1.2 NM) north of NBB
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 46.92);

        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('R')[5]).toBe('      1.2nm');
    });
});

// 3-22: nine nearest waypoints. 5-45: without a database the nearest functions still work on user-defined waypoints,
// so the nearest lists take user waypoints in. Nine database NDBs and one user NDB, the nearest of all, are ten
// candidates for nine places.
describe('the nearest NDB list with a user NDB (3-22, 5-45)', () => {
    it('holds nine NDBs, the user NDB first', async () => {
        const database = Array.from({length: 9}, (_, i) => ndb(`NA${i}`, 47.05 + i * 0.05, 8.0));
        const unit = await bootUnit({facilities: database, position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(ndb('QQ', 47.01, 8.0, {region: 'XX'}));
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'NDB  ');

        const rows = await nearestRowsBackwards(unit);

        expect(rows).toEqual([' QQ    nr 1', ' NA0   nr 2', ' NA1   nr 3', ' NA2   nr 4', ' NA3   nr 5', ' NA4   nr 6', ' NA5   nr 7', ' NA6   nr 8', ' NA7   nr 9']);
    });
});

// The code searches 500 NM around the aircraft and the guide gives no radius; the KLN 89 trainer lists nothing beyond
// 200 NM (the 89 is another product). Whether the 90B radius is 500 NM is open, so this holds the code's value.
describe('the nearest airport list radius (characterization)', () => {
    it('lists an airport 450 NM away as nr 1 when nothing is nearer', async () => {
        // 7.5 degrees of latitude north of the aircraft are 450 NM
        const unit = await bootUnit({facilities: [airport('KFAR', 54.5, 8.0)], position: POSITION});

        // the radius is a question: #NEW-2-7
        expect(await nearestRows(unit)).toEqual([' KFAR  nr 1']);
    });
});

// 2-2: the database classes VORs as high altitude, low altitude, terminal or undefined. 3-22, 3-49: the VOR nearest list
// holds the nine nearest VORs. 3-37: Super NAV 5 draws the VORs of the nearest list, TLH being terminal, low, high and
// undefined. 3-8, 3-32: NAV 2 alone leaves terminal VORs out.
describe('VOR classes in the nearest VOR list', () => {
    // UND (undefined class) 0.02 degrees (1.2 NM), TRM (terminal) 0.05 degrees (3.0 NM), HIG (high altitude) 0.3
    // degrees (18.0 NM) north of the aircraft
    const und = () => vor('UND', 47.02, 8.0, {vorClass: VorClass.Unknown});
    const trm = () => vor('TRM', 47.05, 8.0, {vorClass: VorClass.Terminal});
    const hig = () => vor('HIG', 47.3, 8.0);

    async function nearestVorRows(...facilities: ReturnType<typeof vor>[]): Promise<string[]> {
        const unit = await bootUnit({facilities, position: POSITION});
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'VOR  ');
        return nearestRowsBackwards(unit);
    }

    it.fails('lists a terminal VOR (#NEW-2-4)', async () => {
        expect(await nearestVorRows(trm(), hig())).toEqual([' TRM D nr 1', ' HIG D nr 2']);
    });

    it.fails('lists a VOR of undefined class (#NEW-2-4)', async () => {
        expect(await nearestVorRows(und(), hig())).toEqual([' UND D nr 1', ' HIG D nr 2']);
    });

    it.fails('draws a terminal VOR on Super NAV 5 with VOR: TLH (#NEW-2-4)', async () => {
        const labels: string[] = [];
        const spy = vi.spyOn(CoordinateCanvasDrawContext.prototype, 'drawLabel').mockImplementation((_facility, text) => {
            labels.push(text);
        });
        onTestFinished(() => spy.mockRestore());
        const unit = await bootUnit({storage: {superNav5Vor: 3}, facilities: [trm(), vor('HIG', 47.1, 8.05)], position: POSITION}); // 3 = TLH
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'NAV 4'); // as above: the right side first, then NAV 5 becomes Super NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(2000);
        expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);

        expect([...new Set(labels)].sort()).toEqual(['HIG', 'TRM']);
    });

    // 5-45: the nearest functions work on user-defined waypoints (see the NDB case above). A user VOR has the class
    // and type the user waypoint loaders give it (Unknown, Unknown); its page shows no D.
    it.fails('lists a user VOR (#NEW-2-6)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.02, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown}));
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('R', 'VOR  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' QQV   nr 1', ' HIG D nr 2']);
    });

    // The sibling of the pins: the list itself works for the classes it holds today, so the pins differ only in the class
    it('lists a low and a high altitude VOR', async () => {
        const low = vor('LOW', 47.05, 8.0, {vorClass: VorClass.LowAlt});

        expect(await nearestVorRows(hig(), low)).toEqual([' LOW D nr 1', ' HIG D nr 2']);
    });

    it('shows the nearest low or high altitude VOR on NAV 2, not a nearer terminal VOR (3-8, 3-32)', async () => {
        const unit = await bootUnit({facilities: [trm(), hig()], position: POSITION});
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.selectPage('L', 'NAV 2');

        // HIG is 18.0 NM north: the aircraft is on its 180 radial
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['HIG  180°fr', '     18.0nm']);
    });
});
