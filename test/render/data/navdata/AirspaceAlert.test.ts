import {describe, expect, it, vi} from 'vitest';
import {BoundaryAltitudeType, BoundaryType} from '@microsoft/msfs-sdk';
import {BootOptions, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airspace, AirspaceOptions} from '../../../harness/navdata/airspaces';
import {Screen} from '../../../harness/render/screen';
import {approachWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const square: [number, number][] = [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]];

/** Boots inside a restricted area with the given vertical limits and opens the MSG page after the alert has run */
async function messagesInside(altitudeFt: number, minFt: number, maxFt: number): Promise<string> {
    const unit = await bootUnit({
        position: {lat: 47.0, lon: 8.0}, altitudeFt,
        airspaces: [airspace('R-TEST', BoundaryType.Restricted, square, {minFt, maxFt})],
    });
    await settle(unit);
    // The alert searches every 10 s
    await vi.advanceTimersByTimeAsync(12000);
    await unit.panel.msg();
    return Screen.read().text();
}

// 3-39, 3-40: the SUA alert is three-dimensional; inside the lateral boundary and between the limits (widened by the
// vertical buffer of SET 8, 500 ft by default, 3-41) the unit shows INSIDE SPC USE AIRSPACE
describe('SUA alert, vertical limits of an MSL airspace', () => {
    it('alerts on the ground inside an area whose floor is at 0 ft', async () => {
        expect(await messagesInside(0, 0, 5000)).toContain('INSIDE SPC USE AIRSPACE');
    });

    it('does not alert below the floor and its buffer', async () => {
        expect(await messagesInside(0, 1000, 5000)).not.toContain('SPC USE AIRSPACE');
    });

    it('does not alert above the ceiling and its buffer', async () => {
        expect(await messagesInside(8000, 1000, 5000)).not.toContain('SPC USE AIRSPACE');
    });

    // AirspaceAlert.isVerticallyInsideAirspace compares the aircraft's altitude with minAlt in the ceiling check
    // (AirspaceAlert.ts:155), so every aircraft above the floor plus the buffer counts as outside.
    it.fails('alerts between the floor and the ceiling (#127)', async () => {
        expect(await messagesInside(3000, 1000, 5000)).toContain('INSIDE SPC USE AIRSPACE');
    });
});

/** The messages the MSG page would list, one string per message */
const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));
const sua = (unit: HeadlessUnit) => messages(unit).filter(m => m.includes('AIRSPACE'));

/** NM of longitude at 47 N, flat over these few NM */
const NM_LON = 1 / (60 * Math.cos(47 * Math.PI / 180));
const NM_LAT = 1 / 60;

/** A box from south to north latitude and west to east longitude */
const box = (south: number, north: number, west: number, east: number): [number, number][] => [[north, west], [north, east], [south, east], [south, west]];

/** The aircraft at 47 N 8 E, flying `trackTrue` at 120 kt (20 NM in 10 minutes), after one search of the alert */
async function flying(trackTrue: number, airspaces: ReturnType<typeof airspace>[], o: Partial<BootOptions> = {}) {
    const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 1200, airspaces, ...o});
    await settle(unit);
    await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue});
    // The alert searches every 10 s
    await vi.advanceTimersByTimeAsync(12000);
    return unit;
}

// Figure 3-125's vertical limits, 1000 to 18000 ft MSL. The aircraft flies at 1200 ft, within the floor and the
// default buffer of 500 ft, so the ceiling check of #127 (it compares with the floor plus the buffer) passes as well.
const LIMITS: AirspaceOptions = {minFt: 1000, maxFt: 18000};

describe('AIRSPACE ALERT ahead on the track', () => {
    // 10 NM ahead at 120 kt: 5 minutes to the boundary
    const fiveMinutes = () => airspace('R-AHEAD', BoundaryType.Restricted, box(47 + 10 * NM_LAT, 47.4, 7.9, 8.1), LIMITS);

    it('alerts 5 minutes before the boundary (3-40, B-1)', async () => {
        const unit = await flying(0, [fiveMinutes()]);

        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-AHEAD           REST 1000ft to 18000ft']);
    });

    // Figure 3-125: the message, its name and type, and its vertical limits. The figure also shows the controlling
    // agency on line 3, which the sim's boundary data does not carry, so this test does not look at line 3
    it('shows the name, the type and the vertical limits on the MSG page (3-39, figure 3-125)', async () => {
        const unit = await flying(0, [fiveMinutes()]);
        await unit.panel.msg();

        const rows = Screen.read().text().split('\n');
        const at = rows.findIndex(r => r.trimEnd() === 'AIRSPACE ALERT:');
        expect(at).toBeGreaterThanOrEqual(0);
        expect(rows[at + 1]).toBe(' R-AHEAD           REST');
        expect(rows[at + 2].trimEnd()).toBe(' 1000ft to 18000ft');
    });

    // 30 NM ahead at 120 kt: 15 minutes, and far beyond 2 NM
    it('does not alert 15 minutes before the boundary (3-40, B-1)', async () => {
        const unit = await flying(0, [airspace('R-FAR', BoundaryType.Restricted, box(47.5, 47.7, 7.9, 8.1), LIMITS)]);

        expect(sua(unit)).toEqual([]);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    // The message is given once while the projection keeps meeting the area (characterization: the manual names the
    // trigger, not the repetition)
    it('alerts once over two searches (characterization)', async () => {
        const unit = await flying(0, [fiveMinutes()]);
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit)).toHaveLength(1);
    });

    // 3-39: the alert is three-dimensional. The same area 5 minutes ahead, but from 5000 ft up: the aircraft at 1200 ft
    // passes below it and its 500 ft buffer
    it('does not alert for an area ahead whose floor is above the aircraft (3-39)', async () => {
        const unit = await flying(0, [airspace('R-HIGH', BoundaryType.Restricted, box(47 + 10 * NM_LAT, 47.4, 7.9, 8.1), {minFt: 5000, maxFt: 18000})]);

        expect(sua(unit)).toEqual([]);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    // After the pilot has read the alert and turned away, turning back toward the area alerts again (characterization)
    it('alerts again after the track turned away and back (characterization)', async () => {
        const unit = await flying(0, [fiveMinutes()]);
        await unit.panel.msg();
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.msg();
        await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(10000);
        expect(sua(unit)).toEqual([]); // Precondition: read, and away from the area

        await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-AHEAD           REST 1000ft to 18000ft']);
    });
});

// B-1, 3-40: the alert is also given within about 2 NM of an area, even if the projected track never enters it. The
// area's west edge is 1 NM east of the aircraft and runs north-south beside it, 12 NM south and north.
describe('AIRSPACE ALERT within 2 NM (3-40, B-1)', () => {
    const beside = () => airspace('R-BESIDE', BoundaryType.Restricted, box(47 - 12 * NM_LAT, 47 + 12 * NM_LAT, 8 + NM_LON, 8 + 10 * NM_LON), LIMITS);

    // The passing sibling of the pin: the same area and position, turned toward the area, alerts today (the 10-minute
    // rule), so the setup holds
    it('alerts when the track turns toward the area 1 NM away (3-40, B-1)', async () => {
        const unit = await flying(90, [beside()]);

        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-BESIDE          REST 1000ft to 18000ft']);
    });

    it.fails('alerts on a track along the area 1 NM away (3-40, B-1, #189)', async () => {
        const unit = await flying(0, [beside()]);

        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-BESIDE          REST 1000ft to 18000ft']);
    });
});

describe('INSIDE SPC USE AIRSPACE after the alert', () => {
    // 1 NM ahead: the aircraft is alerted, then enters
    const enter = () => airspace('R-ENTER', BoundaryType.Restricted, box(47 + NM_LAT, 47.4, 7.9, 8.1), LIMITS);

    it('shows INSIDE SPC USE AIRSPACE once the aircraft is in the area (3-40)', async () => {
        const unit = await flying(0, [enter()]);
        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-ENTER           REST 1000ft to 18000ft']); // Precondition

        await moveAircraft(unit, {lat: 47 + 2 * NM_LAT, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit).filter(m => m.startsWith('INSIDE'))).toEqual(['INSIDE SPC USE AIRSPACE R-ENTER           REST 1000ft to 18000ft']);
    });

    // The alert goes once the aircraft is in the area (characterization)
    it('removes AIRSPACE ALERT once the aircraft is in the area (characterization)', async () => {
        const unit = await flying(0, [enter()]);
        expect(sua(unit)).toEqual(['AIRSPACE ALERT: R-ENTER           REST 1000ft to 18000ft']); // Precondition

        await moveAircraft(unit, {lat: 47 + 2 * NM_LAT, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit).filter(m => m.startsWith('AIRSPACE ALERT'))).toEqual([]);
    });

    // The message goes with the aircraft leaving the area laterally (characterization)
    it('removes INSIDE SPC USE AIRSPACE once the aircraft has left the area (characterization)', async () => {
        const unit = await flying(0, [airspace('R-AROUND', BoundaryType.Restricted, box(46.9, 47.1, 7.9, 8.1), LIMITS)]);
        expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE R-AROUND          REST 1000ft to 18000ft']); // Precondition

        await moveAircraft(unit, {lat: 47.3, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});

        expect(sua(unit)).toEqual([]);
    });

    // While the aircraft stays inside, the message is given once (characterization)
    it('shows INSIDE SPC USE AIRSPACE once over two searches (characterization)', async () => {
        const unit = await flying(0, [airspace('R-AROUND', BoundaryType.Restricted, box(46.9, 47.1, 7.9, 8.1), LIMITS)]);
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit)).toHaveLength(1);
    });

    // Leaving and entering again gives the message again, once the first was read (characterization)
    it('shows INSIDE SPC USE AIRSPACE again on entering a second time (characterization)', async () => {
        const unit = await flying(0, [airspace('R-AROUND', BoundaryType.Restricted, box(46.9, 47.1, 7.9, 8.1), LIMITS)]);
        await unit.panel.msg();
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.msg();
        await moveAircraft(unit, {lat: 47.3, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(10000);
        expect(sua(unit)).toEqual([]); // Precondition: read, and outside

        await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(10000);

        expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE R-AROUND          REST 1000ft to 18000ft']);
    });
});

describe('the vertical limits', () => {
    /** Parked inside a box around the aircraft at the given altitude, after one search */
    async function inside(altitudeFt: number, o: AirspaceOptions, boot: Partial<BootOptions> = {}) {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt,
            airspaces: [airspace('R-TEST', BoundaryType.Restricted, box(46.9, 47.1, 7.9, 8.1), o)], ...boot,
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(12000);
        return sua(unit);
    }

    // 3-41: the manual's example. A buffer of 1000 ft stretches an area from 5000 to 12000 ft down to 4000 ft. (Up to
    // 13000 ft as well, which #127 breaks; the ceiling side is pinned above.)
    it('alerts 900 ft below the floor with a buffer of 1000 ft (3-41)', async () => {
        expect(await inside(4100, {minFt: 5000, maxFt: 12000}, {storage: {airspaceAlertBuffer: 1000}}))
            .toEqual(['INSIDE SPC USE AIRSPACE R-TEST            REST 5000ft to 12000ft']);
    });

    it('does not alert 1100 ft below the floor with a buffer of 1000 ft (3-41)', async () => {
        expect(await inside(3900, {minFt: 5000, maxFt: 12000}, {storage: {airspaceAlertBuffer: 1000}})).toEqual([]);
    });

    // 3-41: the default buffer of the SET 8 page is 500 ft (KLN90BUserSettings), so 300 ft below the floor is inside it
    it('alerts 300 ft below the floor with the default buffer (3-41)', async () => {
        expect(await inside(700, {minFt: 1000, maxFt: 18000})).toEqual(['INSIDE SPC USE AIRSPACE R-TEST            REST 1000ft to 18000ft']);
    });

    // 3-39: a floor charted AGL is stored as the surface, so the aircraft at 500 ft is inside an area "from 3000 ft AGL".
    // Figure 3-126 shows such an area as BELOW and the ceiling
    it('treats a floor above ground as the surface (3-39, figure 3-126)', async () => {
        expect(await inside(500, {minFt: 3000, minType: BoundaryAltitudeType.AGL, maxFt: 5000}))
            .toEqual(['INSIDE SPC USE AIRSPACE R-TEST            REST BELOW 5000ft']);
    });

    // 3-39: a ceiling charted AGL is stored as unlimited, so the aircraft at 25000 ft is inside an area "up to 3000 ft AGL".
    // Only the start of the message is looked at here; the limits line has its own test below
    it('treats a ceiling above ground as unlimited (3-39)', async () => {
        const messages = await inside(25000, {minFt: 1000, maxFt: 3000, maxType: BoundaryAltitudeType.AGL});

        expect(messages).toHaveLength(1);
        expect(messages[0].slice(0, 30)).toBe('INSIDE SPC USE AIRSPACE R-TEST');
    });

    // No figure shows the limits line of an area without a ceiling
    it('shows ABOVE and the floor for an area without a ceiling (characterization)', async () => {
        expect(await inside(25000, {minFt: 1000, maxFt: 3000, maxType: BoundaryAltitudeType.AGL}))
            .toEqual(['INSIDE SPC USE AIRSPACE R-TEST            REST ABOVE 1000ft']);
    });

    // 3-40 NOTE: without an altitude input every altitude counts as inside the area
    it('counts every altitude as inside without an altitude input (3-40)', async () => {
        const noAltitude = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><AltimeterInterfaced>false</AltimeterInterfaced></Input></Instrument></PlaneHTMLConfig>';
        expect(await inside(25000, {minFt: 1000, maxFt: 5000}, {panelXml: noAltitude}))
            .toEqual(['INSIDE SPC USE AIRSPACE R-TEST            REST 1000ft to 5000ft']);
    });
});

// The name is cut so that a blank stays before the type (characterization)
describe('a long airspace name', () => {
    it('is cut one character before the type (characterization)', async () => {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('LONG RESTRICTED AREA NAME', BoundaryType.Restricted, box(46.9, 47.1, 7.9, 8.1), {minFt: 0, maxFt: 5000})],
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(12000);

        expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE LONG RESTRICTED A REST 0ft to 5000ft']);
    });
});

describe('when the unit gives no SUA message (3-39, 3-41)', () => {
    async function parkedIn(type: BoundaryType, boot: Partial<BootOptions> = {}) {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('AREA', type, box(46.9, 47.1, 7.9, 8.1), {minFt: 0, maxFt: 5000})], ...boot,
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(12000);
        return unit;
    }

    // The passing sibling of the cases below
    it('alerts inside a MOA (3-39)', async () => {
        expect(sua(await parkedIn(BoundaryType.MOA))).toEqual(['INSIDE SPC USE AIRSPACE AREA               MOA 0ft to 5000ft']);
    });

    // 3-39: Class D is not among the SUA types the database stores
    it('does not alert inside a Class D (3-39)', async () => {
        expect(sua(await parkedIn(BoundaryType.ClassD))).toEqual([]);
    });

    // 3-41: SET 8 disables the alert
    it('does not alert with the alert disabled on SET 8 (3-41)', async () => {
        expect(sua(await parkedIn(BoundaryType.MOA, {storage: {airspaceAlertEnabled: false}}))).toEqual([]);
    });
});

// 3-41 NOTE: SUA alerting is disabled in the approach arm and approach active modes. The approach world of
// fixtures.ts arms the approach 29 NM north of KPRC; an area around that point is entered only there.
describe('SUA alert in the approach modes (3-41)', () => {
    async function at29(armed: boolean) {
        const w = approachWorld();
        const p = w.north(29);
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            airspaces: [airspace('R-APR', BoundaryType.Restricted, box(p.lat - 0.05, p.lat + 0.05, p.lon - 0.1, p.lon + 0.1), {minFt: 0, maxFt: 5000})],
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        if (armed) await unit.panel.loadProcedure('APT 8');
        await moveAircraft(unit, p, {groundspeedKt: 120});
        await vi.advanceTimersByTimeAsync(12000);
        return unit;
    }

    // The passing sibling: without the approach the unit alerts at the same point
    it('alerts in the enroute mode (3-41)', async () => {
        const unit = await at29(false);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE R-APR             REST 0ft to 5000ft']);
    });

    it('does not alert with the approach armed (3-41)', async () => {
        const unit = await at29(true);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(sua(unit)).toEqual([]);
    });
});

// 3-41 NOTE, approach active: the approach world reaches APR 6.5 NM north of KPRC (approachWorld.test.ts); an area
// around that point, 0.6 NM north and south, is not reached before
describe('SUA alert in the approach active mode (3-41)', () => {
    const area = (w: ReturnType<typeof approachWorld>) => {
        const p = w.north(6.5);
        return airspace('R-FINAL', BoundaryType.Restricted, box(p.lat - 0.01, p.lat + 0.01, p.lon - 0.1, p.lon + 0.1), {minFt: 0, maxFt: 5000});
    };

    async function at6p5(approach: boolean) {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(7.5), airspaces: [area(w)],
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        if (approach) {
            await unit.panel.loadProcedure('APT 8');
            await vi.advanceTimersByTimeAsync(31_000);
        }
        await moveAircraft(unit, w.north(6.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(12000);
        return unit;
    }

    // The passing sibling
    it('alerts at that point in the enroute mode (3-41)', async () => {
        const unit = await at6p5(false);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE R-FINAL           REST 0ft to 5000ft']);
    });

    it('does not alert with the approach active (3-41)', async () => {
        const unit = await at6p5(true);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.APR_LEG);
        expect(sua(unit)).toEqual([]);
    });
});
