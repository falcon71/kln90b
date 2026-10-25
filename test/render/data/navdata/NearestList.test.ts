import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {Facility, FacilitySearchType, FacilityType, RunwaySurfaceType, VorClass, VorType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, NEAREST_SEARCH_WAIT_MS, startUnit} from '../../../harness/boot';
import {muteConsoleError} from '../../../harness/console';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {airport, ndb, vor} from '../../../harness/navdata/builders';
import {recordMap} from '../../../harness/render/mapRecorder';
import {Screen} from '../../../harness/render/screen';
import {showSuperNav5} from '../../../harness/render/superNav5';
import {storedSetting} from '../../../harness/storage';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

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
    await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
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
            const map = recordMap();
            const unit = await bootUnit({storage: {superNav5Apt: true}, facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});
            await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
            await showSuperNav5(unit, {waitMs: 2000});

            expect(drawnLabels(map.drawn)).toEqual(['KAAA', 'KGRS', 'KBBB']);
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

/** The texts of the labels of a recorded map frame, in the order drawn */
const drawnLabels = (drawn: string[]) => drawn.filter(d => d.startsWith('label ')).map(d => d.split(' ')[1]);

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
// The nearest order (NBB, NAA, NCC) differs from the alphabetical order, so nr 1, the last nearest and the start of the
// complete list (NAA) are three different waypoints.
describe('the nearest list in front of the complete list (3-22)', () => {
    async function ndbPage(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [ndb('NBB', 47.1, 8.0), ndb('NAA', 47.2, 8.0), ndb('NCC', 47.3, 8.0)], position: POSITION});
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
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
        expect(identRow()).toBe(' NBB   nr 1'); // precondition

        await slowStep(unit, -1);

        expect(identRow()).toBe(' NBB   nr 1');
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
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        // At 46.92 N NBB is 0.02 degrees (1.2 NM) away and NAA 0.13 degrees (7.8 NM)
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 46.92);
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'NDB  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' NBB   nr 1', ' NAA   nr 2']);
    });
});

// The code recomputes bearing and distance every second and searches every 10 s; the guide gives no refresh interval.
describe('the nearest page distance refresh (characterization)', () => {
    // NAA 0.05 degrees (3.0 NM) north, NBB 0.1 degrees (6.0 NM) south of the start
    const world = () => ({facilities: [ndb('NAA', 47.05, 8.0), ndb('NBB', 46.9, 8.0)], position: POSITION});

    // The nearest search runs every 10 s and the first one ran within the first 12 s; the page step and the move fall
    // about 2 s after it, and the check 1.5 s later, well before the next search
    it('updates the distance on a nearest page within seconds, not only at the next search', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'NDB  ');
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.scan();
        await slowStep(unit, -1);
        expect(identRow()).toBe(' NBB   nr 2'); // precondition: the last nearest NDB, 6.0 NM south
        // 47.2 N is 0.3 degrees (18.0 NM) north of NBB
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.2);

        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('R')[5]).toBe('     18.0nm');
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
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'NDB  ');

        const rows = await nearestRowsBackwards(unit);

        expect(rows).toEqual([' QQ    nr 1', ' NA0   nr 2', ' NA1   nr 3', ' NA2   nr 4', ' NA3   nr 5', ' NA4   nr 6', ' NA5   nr 7', ' NA6   nr 8', ' NA7   nr 9']);
    });
});

// The 90B guide gives no radius for the nearest lists. The KLN 89 guide and trainer stop at 200 NM, the AVsoftech 90B
// trainer at about 190 to 220 NM; the maintainer ruled 200 NM (#207). 3.3 degrees of latitude are 198 NM
describe('the nearest list radius (characterization; KLN 89 guide and trainer, maintainer ruling #207)', () => {
    it('lists an airport 198 NM away as nr 1 when nothing is nearer', async () => {
        const unit = await bootUnit({facilities: [airport('KFAR', 50.3, 8.0)], position: POSITION});

        expect(await nearestRows(unit)).toEqual([' KFAR  nr 1']);
    });

    it('leaves out an airport 204 NM away', async () => {
        const unit = await bootUnit({facilities: [airport('KFAR', 50.4, 8.0)], position: POSITION});

        expect(await nearestRows(unit)).toEqual([]);
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
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'VOR  ');
        return nearestRowsBackwards(unit);
    }

    it('lists a terminal VOR (#204)', async () => {
        expect(await nearestVorRows(trm(), hig())).toEqual([' TRM D nr 1', ' HIG D nr 2']);
    });

    it('lists a VOR of undefined class (#204)', async () => {
        expect(await nearestVorRows(und(), hig())).toEqual([' UND D nr 1', ' HIG D nr 2']);
    });

    /** The labels Super NAV 5 draws with VOR: TLH (3 in the settings) for the given VORs; they are a few NM from the aircraft */
    async function superNav5Labels(...facilities: ReturnType<typeof vor>[]): Promise<string[]> {
        const map = recordMap();
        const unit = await bootUnit({storage: {superNav5Vor: 3}, facilities, position: POSITION}); // 3 = TLH
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await showSuperNav5(unit, {waitMs: 2000});

        return [...new Set(drawnLabels(map.drawn))].sort();
    }

    // The sibling of the terminal VOR test below: the same page and spy see a high altitude VOR
    it('draws a high altitude VOR on Super NAV 5 with VOR: TLH', async () => {
        expect(await superNav5Labels(vor('HIG', 47.1, 8.05))).toEqual(['HIG']);
    });

    it('draws a terminal VOR on Super NAV 5 with VOR: TLH (#204)', async () => {
        expect(await superNav5Labels(trm(), vor('HIG', 47.1, 8.05))).toEqual(['HIG', 'TRM']);
    });

    // 5-45: the nearest functions work on user-defined waypoints (see the NDB case above). A user VOR has the class
    // and type the user waypoint loaders give it (Unknown, Unknown); its page shows no D.
    it('lists a user VOR (#206)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.02, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown}));
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'VOR  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' QQV   nr 1', ' HIG D nr 2']);
    });

    // 3-8, 3-32: NAV 2 shows a low or high altitude VOR. Maintainer ruling, #206: a user VOR (class Unknown) never is the
    // NAV 2 VOR, however near it is. The user VOR is 1.2 NM, HIG 18.0 NM from the aircraft.
    it('shows HIG on NAV 2 although a user VOR is nearer (3-8, 3-32; maintainer ruling, #206)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.02, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown}));
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('L', 'NAV 2');

        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['HIG  180°fr', '     18.0nm']);
    });

    // Characterization: the guide is silent on a database VOR of undefined class on NAV 2. It follows from "NAV 2 shows a
    // low or high altitude VOR" (3-8, 3-32) only by inference, and the class mask of the NAV 2 search holds it
    it('shows HIG on NAV 2 although a database VOR of undefined class is nearer (characterization; 3-8, 3-32)', async () => {
        const unit = await bootUnit({facilities: [und(), hig()], position: POSITION});
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('L', 'NAV 2');

        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['HIG  180°fr', '     18.0nm']);
    });

    // 5-45: a user VOR of a real class is filtered like a database VOR, so the flags of its class and type are compared
    // with the masks of the VOR page (#128). The VOR type shows no D.
    it('lists a user VOR of low altitude class and VOR type (#128)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.02, 8.0, {region: 'XX', vorClass: VorClass.LowAlt, type: VorType.VOR}));
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'VOR  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' QQV   nr 1', ' HIG D nr 2']);
    });

    // Code contracts (characterization): each guard keeps one of the two flags inside its mask and moves the other out.
    // TACAN is not in the type mask of the VOR page. VOT is not in its class mask, and it is not one of the four classes
    // of 2-2, so no page pins it. The terminal and undefined classes are held by the #204 and #206 tests.
    it('leaves out a user VOR whose type is outside the type mask (#128)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQT', 47.02, 8.0, {region: 'XX', vorClass: VorClass.HighAlt, type: VorType.TACAN}));
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'VOR  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' HIG D nr 1']);
    });

    it('leaves out a user VOR whose class is outside the class mask (#128)', async () => {
        const unit = await bootUnit({facilities: [hig()], position: POSITION});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQO', 47.02, 8.0, {region: 'XX', vorClass: VorClass.VOT, type: VorType.VOR}));
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('R', 'VOR  ');

        expect(await nearestRowsBackwards(unit)).toEqual([' HIG D nr 1']);
    });

    // The sibling of the terminal and undefined class tests: a low and a high altitude VOR were listed before #204 as well, so
    // those tests differ only in the class
    it('lists a low and a high altitude VOR', async () => {
        const low = vor('LOW', 47.05, 8.0, {vorClass: VorClass.LowAlt});

        expect(await nearestVorRows(hig(), low)).toEqual([' LOW D nr 1', ' HIG D nr 2']);
    });

    it('shows the nearest low or high altitude VOR on NAV 2, not a nearer terminal VOR (3-8, 3-32)', async () => {
        const unit = await bootUnit({facilities: [trm(), hig()], position: POSITION});
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('L', 'NAV 2');

        // HIG is 18.0 NM north: the aircraft is on its 180 radial
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['HIG  180°fr', '     18.0nm']);
    });

    // 3-8, 3-32: NAV 2 shows the nearest low or high altitude VOR, so it shows one behind nine nearer terminal VORs. That
    // NAV 2 searches its VOR of its own (NearestUtils.getNearestLowHighVor), not in the nine entries of the VOR page, is
    // the design of #204 (characterization).
    it('shows a high altitude VOR on NAV 2 although nine nearer VORs are terminal (3-8, 3-32, #204)', async () => {
        // T01..T09 are 0.6 to 5.4 NM north of the aircraft, never two at the same coordinates
        const terminals = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => vor('T0' + i, 47.0 + 0.01 * i, 8.05, {vorClass: VorClass.Terminal}));
        const unit = await bootUnit({facilities: [...terminals, hig()], position: POSITION});
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.selectPage('L', 'NAV 2');

        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['HIG  180°fr', '     18.0nm']);
    });
});

/**
 * A facility client for the nearest NDB list: it holds `facilities`, and with `rejectFirst` the first search of its NDB
 * session rejects, the way bootFailure.test.ts builds a client whose search sessions cannot be started. Every search
 * after that works. `rejectedSearches()` counts the searches it rejected, which does not depend on what the unit does
 * with the rejection.
 */
function clientForNdbSearch(facilities: Facility[], rejectFirst: boolean) {
    const client = new MemoryFacilityClient(facilities);
    let rejectedSearches = 0;
    const startSession = client.startNearestSearchSessionWithIcaoStructs.bind(client);
    client.startNearestSearchSessionWithIcaoStructs = async (type: FacilitySearchType) => {
        const session = await startSession(type);
        if (type === FacilitySearchType.Ndb && rejectFirst) {
            const search = session.searchNearest.bind(session);
            session.searchNearest = (...args: unknown[]) => {
                if (rejectedSearches > 0) return search(...args);
                rejectedSearches++;
                return Promise.reject(new Error('nearest search failed'));
            };
        }
        return session;
    };
    return {client, rejectedSearches: () => rejectedSearches};
}

/**
 * Boots on a client from clientForNdbSearch, lets the first searches run (the NDB list's rejects with `rejectFirst`),
 * takes the rejections, adds an NDB 3 NM north of the aircraft and lets two more searches run. Returns the number of
 * searches the client rejected and the idents the nearest NDB list holds at the end.
 */
async function ndbListAfterAFirstSearch(rejectFirst: boolean) {
    const {client, rejectedSearches} = clientForNdbSearch([], rejectFirst);
    const unit = await bootUnit({platform: {createFacilityClient: () => client as any}});
    await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
    expect(unit.takeRejections()).toEqual([]); // since #95 the tick controller handles a rejected search, so none reaches the test
    client.add(ndb('NAA', 47.05, 8.0));
    await vi.advanceTimersByTimeAsync(2 * NEAREST_SEARCH_WAIT_MS);
    const listed = unit.props.nearestLists.ndbNearestList.getNearestList().map(w => w.facility.icaoStruct.ident);
    return {unit, rejected: rejectedSearches(), listed};
}

// 3-22: the nearest lists follow the aircraft, so a waypoint that comes into range is listed at a later search.
// NearestList.tick is async. A rejected search used to leave isCalculating set, so the list was never searched again, and
// TickController.tickCalc did not await the promise, so the error page never showed the rejection (#95).
describe('the nearest NDB list after a rejected search (#95)', () => {
    // The sibling of the tests below: the same client and the same steps without the failure, so they differ only in it
    it('lists an NDB that comes into range after the first search (3-22)', async () => {
        const {rejected, listed} = await ndbListAfterAFirstSearch(false);

        expect(rejected).toBe(0);
        expect(listed).toEqual(['NAA']);
    });

    // The setup of the tests below: the failing client does reject one search, whatever the unit does with it
    it('the failing client rejects one NDB search (setup of the #95 tests)', async () => {
        const {rejected} = await ndbListAfterAFirstSearch(true);

        expect(rejected).toBe(1);
    });

    it('lists an NDB that comes into range after a rejected search (3-22, #95)', async () => {
        const {listed} = await ndbListAfterAFirstSearch(true);

        expect(listed).toEqual(['NAA']);
    });

    // The synchronous tickables show their errors on the error page (docs/architecture.md, Core 2); a failed search is
    // as much a failure of the unit
    it('shows a failed nearest search on the error page (#95)', async () => {
        await ndbListAfterAFirstSearch(true);

        expect(document.querySelector('.errorpage')!.classList.contains('d-none')).toBe(false);
    });

    // The database rejects for a facility it cannot load (KLNFacilityLoader answers null for it); the search finds the
    // NDB NBD, but loading it fails. The other NDB of the same search is listed. A code contract (characterization): the
    // guide does not say what the unit does with a facility it cannot load.
    it('lists the NDBs it can load when one of a search cannot be loaded (#95)', async () => {
        const client = new MemoryFacilityClient([ndb('NAA', 47.05, 8.0), ndb('NBD', 47.0667, 8.0)]);
        const getFacility = client.getFacility.bind(client);
        client.getFacility = (type: FacilityType, icao: any) => {
            if (typeof icao !== 'string' && icao.ident === 'NBD') return Promise.reject(new Error('facility cannot be loaded'));
            return getFacility(type, icao);
        };
        const unit = await bootUnit({platform: {createFacilityClient: () => client as any}});

        await vi.advanceTimersByTimeAsync(2 * NEAREST_SEARCH_WAIT_MS);

        expect(unit.props.nearestLists.ndbNearestList.getNearestList().map(w => w.facility.icaoStruct.ident)).toEqual(['NAA']);
    });
});

// The lists search every 10 s of calculation ticks (NearestList.tick), but their sessions exist only once
// NearestList.init() resolves. A session start that takes longer than 10 s (the sim's facility database is slow) must
// not make the first search throw: AirspaceAlert.tick guards the same case.
describe('the nearest lists before their search sessions have started (#424)', () => {
    it.fails('publishes no error while the nearest search sessions have not started (#424)', async () => {
        muteConsoleError();
        const startSession = MemoryFacilityClient.prototype.startNearestSearchSessionWithIcaoStructs;
        const spy = vi.spyOn(MemoryFacilityClient.prototype, 'startNearestSearchSessionWithIcaoStructs').mockImplementation(
            function (this: MemoryFacilityClient, type: FacilitySearchType) {
                const hung = type === FacilitySearchType.Airport || type === FacilitySearchType.Vor || type === FacilitySearchType.Ndb;
                return hung ? new Promise<any>(() => undefined) : startSession.call(this, type);
            });
        onTestFinished(() => spy.mockRestore());

        // The boot waits for the sessions, so it never reaches propsReady; the calculation ticks run all the same
        const unit = await startUnit({}, 11_000);

        expect(unit.errors.filter(e => e instanceof TypeError)).toEqual([]);
    });
});
