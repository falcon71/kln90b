import {describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {DEFAULT_START} from '../../../harness/sim/clock';
import {inhibitAllBut} from '../../../harness/gps';
import {APR_ARM_SWITCH, NO_ALTIMETER, panelXml} from '../../../harness/panelXml';
import {approachWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {GpsGeometry} from '../../../../kln90b/GpsSolution';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

// The STA 1 snapshot of a unit with a fix is in GpsAcquisition.test.ts (describe 'STA 1 page with a fix'); the INIT
// state of an almanac search is below. The decisions of #215: INIT covers the almanac and the sky searches (ORS 20 has
// no state of its own for them), ACQ is the start model's acquisition even when nothing can be acquired, NAV A shows
// whenever there is an altitude

/**
 * A cold-and-dark unit with slow acquisition and an almanac 200 days old, powered on: an almanac search, a blind search
 * in PRN order (ORS 01 6-30). STA 1 is shown right after the self-test, before any satellite is acquired.
 */
async function almanacSearch(): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest({
        storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 200 * 24 * 3600 * 1000},
    });
    await unit.panel.approveSelfTest();
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** The PRNs of the receiver's satellites below the horizon, from the SDK's zenith angle (above 90 degrees) */
function belowHorizon(unit: HeadlessUnit): number[] {
    const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
    return sats.filter(s => s.position.get()[0] > Math.PI / 2).map(s => s.prn).sort((a, b) => a - b);
}

/** The PRN and the ELE field of a satellite row ("*02  00 83°": PRN 2, ELE "83") */
const prnAndEle = (row: string): [number, string] => [Number(row.slice(1, 3)), row.slice(8, 10)];

describe('STA 1 page during an almanac search', () => {
    // 5-30: a * before the satellite number means the satellite is not used in the position solution; during an almanac
    // search no satellite is
    it('marks every satellite as not used in the solution during an almanac search (5-30)', async () => {
        const unit = await almanacSearch();
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        const rows = await satelliteRows(unit);

        expect(rows.map(r => r[0])).toEqual(['*', '*', '*', '*', '*', '*', '*', '*']);
    });

    // 5-29: there are two STA 1 pages when more than four satellites are received, which the + in STA+1 shows
    it('has a second page, STA+1, with eight satellites (5-29)', async () => {
        const unit = await almanacSearch();

        expect(Screen.read().status().left).toBe('STA+1');
        expect((await satelliteRows(unit)).map(r => prnAndEle(r)[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    // The precondition of the #213 pin below, on the same sequence: during an almanac search with no fix the receiver
    // tracks satellites that are below the horizon by the SDK's own zenith angle (with the seed and the ephemeris of the
    // harness)
    it('characterization: the receiver tracks satellites below the horizon during an almanac search (precondition of #213)', async () => {
        const unit = await almanacSearch();

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(belowHorizon(unit)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    // 5-30: the elevation column ranges from 5 to 90 degrees above the horizon; a satellite below the horizon has no
    // elevation of 5 degrees or more (the page used to mirror it: |90 - zenith|). Satellites without orbit data show
    // dashes
    it('shows no elevation of 5 degrees or more for a satellite below the horizon (5-30, #213)', async () => {
        const unit = await almanacSearch();
        const below = belowHorizon(unit);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => below.includes(prn));

        expect(shown.filter(([, ele]) => /^\d\d$/.test(ele) && Number(ele) >= 5)).toEqual([]);
    });

    // #213: during the almanac search the receiver cannot know where a satellite it searches blindly stands; unknown
    // values are dashes
    it('shows dashes for the elevation of satellites without orbit data during an almanac search (#213)', async () => {
        const unit = await almanacSearch();
        const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
        const withoutData = sats.filter(s => s.lastEphemerisTime === undefined).map(s => s.prn);
        expect(withoutData.length).toBeGreaterThan(0);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => withoutData.includes(prn));

        expect(shown.map(([, ele]) => ele)).toEqual(withoutData.map(() => '--'));
    });
});

// A real-unit video: started 829 NM from its stored position, STA 1 showed ACQ with the satellites the almanac predicts
// for the stored position and their predicted elevations, constant through the acquisition; not yet received ones with
// a * and SNR 00 (#213)
describe('STA 1 page during ACQ', () => {
    const STORED_LAT = 47 + 829 / 60;

    async function acquisition(): Promise<HeadlessUnit> {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: STORED_LAT, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        return unit;
    }

    it('shows the predicted elevations, unchanged 30 s later, not the true ones (#213)', async () => {
        const unit = await acquisition();
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        const predicted = new Map(gps.search.predictedSatellites().map(p =>
            [p.prn, Math.round(90 - p.position.get()[0] * 180 / Math.PI)]));

        const first = (await satelliteRows(unit)).map(prnAndEle);
        await vi.advanceTimersByTimeAsync(30_000);
        const later = (await satelliteRows(unit)).map(prnAndEle);

        expect(first.map(([prn]) => prn)).toEqual([...predicted.keys()].sort((a, b) => a - b));
        for (const [prn, ele] of first) {
            expect(Math.abs(Number(ele) - predicted.get(prn)!)).toBeLessThanOrEqual(1);
        }
        expect(later).toEqual(first);
        const truth = (prn: number) => {
            const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
            return 90 - sat.position.get()[0] * 180 / Math.PI;
        };
        expect(first.some(([prn, ele]) => Math.abs(Number(ele) - truth(prn)) >= 3)).toBe(true);
    }, 60_000);
});

// #213: the guard itself. Right after the aircraft jumps to the other side of the earth the tracked satellites are all
// below the horizon but still have current orbit data (the SDK drops them only later). They have no elevation and show
// dashes, not the mirrored angle
describe('STA 1 page, tracked satellites with orbit data below the horizon', () => {
    it('shows dashes for a tracked satellite below the horizon that has current orbit data (5-30, #213)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const channels = () => gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
        expect(channels().length).toBeGreaterThan(0);

        await moveAircraft(unit, {lat: -47, lon: -172}, {groundspeedKt: 0});
        await unit.panel.selectPage('L', 'STA 1');

        const below = channels()
            .filter(s => s.position.get()[0] > Math.PI / 2 && s.isCachedEphemerisValid(gps.simTimeUnix))
            .map(s => s.prn).sort((a, b) => a - b);
        expect(below.length).toBeGreaterThan(0);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => below.includes(prn));

        expect(shown.map(([prn]) => prn)).toEqual(below);
        expect(shown.map(([, ele]) => ele)).toEqual(below.map(() => '--'));
    }, 60_000);
});


// 5-29, 5-30: the transition state means enough satellites are tracked but no position is produced yet. A real-unit video
// shows it for about half a second between ACQ and NAV A; the unit accepts the position one calculation tick after the
// receiver has its solution (#215)
describe('STA 1 receiver states (5-29)', () => {
    it('shows TRAN on the tick of the first solution, NAV one second later (5-29, #215)', async () => {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        //The unit's own solution (#453), not the SDK's state: the unit's solution can come with three satellites and the
        //altitude, before the SDK's, which needs four
        const ownSolution = () => gps.solution.valid;
        for (let i = 0; i < 600 && !ownSolution(); i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(ownSolution()).toBe(true);
        await vi.advanceTimersByTimeAsync(250); //one display tick

        expect(gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE  TRAN');

        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.isValid()).toBe(true);
        expect(Screen.read().rows('L')[0]).toMatch(/^STATE (  NAV|NAV A|NAV D)$/);
    }, 60_000);
});

// 5-29: the state follows the receiver's own solution (#453). NAV A is a position from three satellites plus the altitude;
// DEGRD is our reading of "RAIM is not available for the geometry", which is a low-confidence call (design, 5.3)
describe('STA 1 states from the receiver solution (5-29, #453)', () => {
    /** A valid six-measurement geometry whose horizontal protection level exceeds the 2 NM en-route limit (200 x 5 m x 5.3 = 2.9 NM) */
    const POOR_GEOMETRY: GpsGeometry = {
        valid: true, satellites: 6, altitudeAided: false, measurements: 6, hdop: 1, cNorth: 0.5, cEast: 0.5, epeNm: 0.01, maxSlope: 200,
    };

    async function staOneWithFix(options: Parameters<typeof bootUnit>[0] = {}): Promise<HeadlessUnit> {
        const unit = await bootUnit(options);
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 1');
        return unit;
    }

    it('shows NAV A on three satellites with an altitude input', async () => {
        const unit = await staOneWithFix();

        inhibitAllBut(unit, 3);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(unit.props.sensors.in.gps.solution.altitudeAided).toBe(true);
        expect(Screen.read().rows('L')[0]).toBe('STATE NAV A');
    }, 60_000);

    it('shows ACQ after losing the fix on three satellites without altitude', async () => {
        const unit = await staOneWithFix({panelXml: panelXml(NO_ALTIMETER)});
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);

        inhibitAllBut(unit, 3);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
    }, 60_000);

    it('shows DEGRD while RAIM is unavailable for geometry', async () => {
        const unit = await staOneWithFix();
        const gps = unit.props.sensors.in.gps;

        vi.spyOn(gps, 'solution', 'get').mockReturnValue(POOR_GEOMETRY);
        await vi.advanceTimersByTimeAsync(500);

        expect(gps.isValid()).toBe(true);
        expect(Screen.read().rows('L')[0]).toBe('STATE DEGRD');
    }, 60_000);

    it('does not show DEGRD when RAIM lacks measurements', async () => {
        const unit = await staOneWithFix();
        const gps = unit.props.sensors.in.gps;

        vi.spyOn(gps, 'solution', 'get').mockReturnValue({...POOR_GEOMETRY, measurements: 4, satellites: 4});
        await vi.advanceTimersByTimeAsync(500);

        expect(gps.isValid()).toBe(true);
        expect(Screen.read().rows('L')[0]).toBe('STATE   NAV');
    }, 60_000);

    it('shows NAV when the geometry is fine, with RAIM available', async () => {
        const unit = await staOneWithFix({panelXml: panelXml(NO_ALTIMETER)});
        const gps = unit.props.sensors.in.gps;
        vi.spyOn(gps, 'solution', 'get').mockReturnValue({...POOR_GEOMETRY, maxSlope: 20});

        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().rows('L')[0]).toBe('STATE   NAV');
    }, 60_000);

    /**
     * Reaches each flight phase through the unit's own mode logic, as a pilot would (a mode written into the memory is
     * reverted by the next calculation tick): the approach world of the mode controller tests, loaded from APT 8
     */
    async function inMode(mode: NavMode): Promise<HeadlessUnit> {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(mode === NavMode.APR_LEG ? 7.5 : 20),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        if (mode === NavMode.ENR_OBS) {
            await unit.panel.obsMode();
        }
        if (mode !== NavMode.ENR_LEG && mode !== NavMode.ENR_OBS) {
            await unit.panel.loadProcedure('APT 8');
            await vi.advanceTimersByTimeAsync(31_000);
        }
        if (mode === NavMode.ARM_OBS) {
            await unit.panel.obsMode();
        }
        if (mode === NavMode.APR_LEG) {
            //Inbound on the final course and inside 2 NM of the FAF (5 NM before the airport): the approach goes active
            await moveAircraft(unit, w.north(5 + 1.95), {groundspeedKt: 120, trackTrue: 180});
            await vi.advanceTimersByTimeAsync(1000);
        }
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.selectPage('L', 'STA 1');
        return unit;
    }

    // The alert limit of each flight phase (2 NM en route, 1 NM armed, 0.3 NM approach active): a protection level of
    // 1.7 NM (maxSlope 120 x 5 m x 5.3) is degraded for the two stricter limits only. The OBS modes use the limit of
    // their phase
    it.each([
        [NavMode.ENR_LEG, 'ENR_LEG', 'STATE   NAV'],
        [NavMode.ENR_OBS, 'ENR_OBS', 'STATE   NAV'],
        [NavMode.ARM_LEG, 'ARM_LEG', 'STATE DEGRD'],
        [NavMode.ARM_OBS, 'ARM_OBS', 'STATE DEGRD'],
        [NavMode.APR_LEG, 'APR_LEG', 'STATE DEGRD'],
    ])('judges a protection level of 1.7 NM in mode %s (%s) as %s', async (mode, _name, expected) => {
        const unit = await inMode(mode);
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(true);
        vi.spyOn(gps, 'solution', 'get').mockReturnValue({...POOR_GEOMETRY, maxSlope: 120});

        await vi.advanceTimersByTimeAsync(500);

        expect(unit.props.memory.navPage.navmode).toBe(mode);
        expect(Screen.read().rows('L')[0]).toBe(expected);
    }, 60_000);

    // NAV D means a satellite is acquired but not yet in use. The real sky has none once the unit is settled, so one
    // channel's public state is spied as Acquired (the page reads sat.state.get()); the solution is spied as well
    describe('with a satellite in the Acquired state', () => {
        async function withAcquiredSatellite(geometry: GpsGeometry): Promise<HeadlessUnit> {
            const unit = await staOneWithFix();
            const gps = unit.props.sensors.in.gps;
            const sat = gps.gpsSatComputer.getChannels().filter(s => s !== null)[0] as GPSSatellite;
            vi.spyOn(sat.state, 'get').mockReturnValue(GPSSatelliteState.Acquired);
            vi.spyOn(gps, 'solution', 'get').mockReturnValue(geometry);
            await vi.advanceTimersByTimeAsync(500);
            expect(gps.isValid()).toBe(true);
            return unit;
        }

        it('shows NAV D with a fine geometry', async () => {
            await withAcquiredSatellite({...POOR_GEOMETRY, maxSlope: 20});

            expect(Screen.read().rows('L')[0]).toBe('STATE NAV D');
        }, 60_000);

        it('shows DEGRD, not NAV D, with a poor geometry', async () => {
            await withAcquiredSatellite(POOR_GEOMETRY);

            expect(Screen.read().rows('L')[0]).toBe('STATE DEGRD');
        }, 60_000);
    });
});

// 5-29: the second page exists only while more than four satellites are listed. A unit on STA+1 whose satellites drop to
// four or fewer goes back to the first page, with the state on it (#466)
describe('STA 1 page count follows the satellites (5-29, #466)', () => {
    it('falls back to the first page when the satellites drop to four', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 1');
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[0]).not.toMatch(/^STATE /); // Precondition: on the second page
        expect(Screen.read().status().left).toBe('STA+1');

        inhibitAllBut(unit, 4);
        await vi.advanceTimersByTimeAsync(7000); // Past the SDK's next position update (every 5 s)

        expect(Screen.read().rows('L')[0]).toMatch(/^STATE /);
        expect(Screen.read().rows('L')[1]).toBe(' SV SNR ELE');
        expect(Screen.read().status().left).toBe('STA 1');
    }, 60_000);
});
