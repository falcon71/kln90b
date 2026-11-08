import {afterEach, describe, expect, it, vi} from 'vitest';
import {GeoPoint, GPSSatelliteState, GPSSystemState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {flyStraight, spooferAt} from '../../harness/gps';
import {DEFAULT_START} from '../../harness/sim/clock';
import {LatLon, pointFrom} from '../../harness/flight/geo';
import {spooferPowerDb} from '../../../kln90b/GpsTransmitter';
import {MASK_ZENITH_RAD} from '../../../kln90b/GpsSignal';
import {SpooferSite} from '../../../kln90b/failures/Transmitters';
import {SearchMode} from '../../../kln90b/GpsSearch';
import {powerForLevelDb} from '../../harness/transmitterGain';

/**
 * #465: what STA 1 shows of a spoofer's fake satellites (design docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-
 * transmitters-design.md, "The fake receiver and the shared channels" and "What the pilot sees"). The fake satellites take
 * the unit's channels, so STA 1 lists them as any satellite (Pilot's Guide 5-29, 5-30): a flat, high SNR, as every fake
 * signal arrives over the same path, and the elevations of the fake sky once the unit believes the false position and time.
 * The unit is captured on its own: the fake satellites enter its solution, which moves its belief to the false position and
 * time (design, "The solution")
 */

const HOME: LatLon = {lat: 47, lon: 8};
const STORED_HOME = {lastLatitude: HOME.lat, lastLongitude: HOME.lon};
const SHIFT_MS = 6 * 3600 * 1000;
/** The shift of the captured unit's spoofer: two hours, so that the two skies share enough PRNs for a fix (design, "Shared PRNs") */
const CAPTURE_SHIFT_MS = 2 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);
const byNumber = (a: number, b: number) => a - b;

afterEach(() => {
    vi.restoreAllMocks();
});

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second, below its header) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    if (Screen.read().status().left !== 'STA+1') {
        return first.filter(r => r.trim() !== '');
    }
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').slice(1).filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** Brings the display one tick past a calculation tick, so that the screen shows what that calculation tick left */
async function afterCalcTick(unit: HeadlessUnit): Promise<void> {
    await untilCalcTick(unit);
    await vi.advanceTimersByTimeAsync(250);
}

const prnOf = (row: string) => Number(row.slice(1, 3));
const snrOf = (row: string) => Number(row.slice(5, 7));
const elevationOf = (row: string) => Number(row.slice(8, 10));

/**
 * The PRNs above the 5 degree mask and their elevations in degrees, as the SDK predicts them at a place and time, apart
 * from the fake receiver's own prediction
 */
function skyAt(unit: HeadlessUnit, lat: number, lon: number, time: number): Map<number, number> {
    const context = unit.props.sensors.in.gps.gpsSatComputer.createPredictionContext();
    context.setPosition(lat, lon, 0, time).predict();
    const sky = new Map<number, number>();
    for (const sat of context.getSatellites()) {
        const zenith = sat.position.get()[0];
        if (sat.sbasGroup === undefined && zenith < MASK_ZENITH_RAD) {
            sky.set(sat.prn, 90 - zenith * 180 / Math.PI);
        }
    }
    context.destroy();
    return sky;
}

/** A spoofer at a distance and bearing from HOME, its false position 60 NM from it */
function spoofer(bearing: number, nm: number, powerDb: number, shiftMs: number): SpooferSite {
    const p = pointFrom(HOME, bearing, nm);
    const f = pointFrom(p, 20, 60);
    return {lat: p.lat, lon: p.lon, powerDb, refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs, clockM: 0};
}

/**
 * An engine-running unit at HOME on the ground 5 NM from a spoofer two hours ahead, which drowns every real satellite. The
 * fake satellites of the PRNs up in both skies give the unit a fix at the false position and the false time, after which
 * it searches the fake sky: it is captured, with every channel a fake satellite in use. REAL acquisition: FAST would set
 * the memory to the true state at a power-on (#468)
 */
async function capturedUnit(): Promise<{ unit: HeadlessUnit, site: SpooferSite }> {
    const site = spoofer(200, 5, spooferPowerDb(300), CAPTURE_SHIFT_MS);
    const unit = await bootUnit({storage: {...STORED_HOME, fastGpsAcquisition: false, ...spooferAt(site)}});
    const gps = unit.props.sensors.in.gps;
    gps.fakeReceiver.jitterScale = 0;
    const captured = () => gps.isValid() && gps.fakeReceiver.believesFalse && gps.fakeReceiver.inUsePrns().length === 8;
    for (let s = 0; s < 20 * 60 && !captured(); s++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
    expect(captured()).toBe(true); // Precondition
    expect(nmBetween(gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.1);
    expect(Math.abs(gps.timeZulu.getTimestamp() - (gps.simTimeUnix + CAPTURE_SHIFT_MS))).toBeLessThan(2000);
    await unit.panel.selectPage('L', 'STA 1');
    return {unit, site};
}

const nmBetween = (a: LatLon, b: LatLon) => new GeoPoint(a.lat, a.lon).distance(b.lat, b.lon) * 3437.7468;

/**
 * Keeps the fake satellites out of the unit's solution: for the tests of the search, which a fix from them would end
 */
function keepFakesOutOfSolution(unit: HeadlessUnit): void {
    vi.spyOn(unit.props.sensors.in.gps.fakeReceiver, 'inUsePrns').mockReturnValue([]);
}

/**
 * In flight at 10,000 ft, 80 NM from a spoofer whose fake signals together are 11.5 dB over the noise there (the power from
 * the test harness's gain): they raise the noise by about 12 dB, which drowns the low real satellites and leaves the high
 * ones. No time shift, so that the two skies share their PRNs. The fade and the estimate noise pinned
 */
async function mixedPhaseUnit(): Promise<HeadlessUnit> {
    const site = spoofer(200, 80, powerForLevelDb(11.5, 80, 10_000), 0);
    const unit = await bootUnit({
        altitudeFt: 10_000, storage: {...STORED_HOME, ...spooferAt(site)},
        simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 10_000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
    });
    const gps = unit.props.sensors.in.gps;
    gps.signals.fadeScale = 0;
    gps.signals.jitterScale = 0;
    gps.fakeReceiver.jitterScale = 0;
    await settle(unit);
    return unit;
}

describe('STA 1 with a spoofer (#465)', () => {
    it("a captured unit's STA 1 shows the fake satellites with a flat SNR and their fake-sky elevations", async () => {
        const {unit, site} = await capturedUnit();
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(90_000);
        await afterCalcTick(unit);

        expect(gps.fakeReceiver.believesFalse).toBe(true); // Precondition: captured
        expect(gps.isValid()).toBe(true); // Precondition: the fake satellites are the solution
        const sky = skyAt(unit, site.falseLat, site.falseLon, gps.simTimeUnix + CAPTURE_SHIFT_MS);
        expect(sky.size).toBeGreaterThanOrEqual(9); // Precondition: more fake satellites than channels
        expect(gps.transmitters.spooferFakeCount).toBe(sky.size); // The fake sky's count goes to the transmitters

        // The cap of n fake signals over each other's noise: 60 - 10 log10(n - 1) (GpsTransmitter SPECTRAL_SEPARATION_DBHZ)
        const flat = Math.round(60 - 10 * Math.log10(sky.size - 1));
        const rows = await satelliteRows(unit);
        expect(rows.length).toBe(8);
        for (const row of rows) {
            expect(row[0]).toBe(' '); // In use
            expect(sky.has(prnOf(row))).toBe(true);
            expect(snrOf(row)).toBe(flat);
            expect(Math.abs(elevationOf(row) - sky.get(prnOf(row))!)).toBeLessThanOrEqual(1);
        }
        // The SDK's satellites in the claimed channels are held lost, so none is tracked there
        expect(gps.gpsSatComputer.getChannels().filter(s => s !== null && TRACKED.has(s.state.get()))).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('in the mixed phase STA 1 lists real and fake satellites, at most 8', async () => {
        const unit = await mixedPhaseUnit();
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 1');
        await vi.advanceTimersByTimeAsync(90_000);
        await afterCalcTick(unit);

        const channelRows = gps.channelRows().map(r => ({...r}));
        const fake = channelRows.filter(r => r.fake);
        const real = channelRows.filter(r => !r.fake);
        expect(fake.length).toBeGreaterThan(0);
        expect(real.filter(r => r.state === GPSSatelliteState.InUse).length).toBeGreaterThan(0);
        expect(channelRows.length).toBeLessThanOrEqual(8);

        const rows = await satelliteRows(unit);
        expect(rows.map(prnOf)).toEqual(channelRows.map(r => r.prn).sort(byNumber));
        // The fake satellites in use show one SNR, apart from the real ones' (the SNR is shown only for a satellite in use)
        const fakeInUse = fake.filter(r => r.state === GPSSatelliteState.InUse).map(r => r.prn);
        expect(fakeInUse.length).toBeGreaterThan(0);
        const fakeSnrs = new Set(rows.filter(r => fakeInUse.includes(prnOf(r))).map(snrOf));
        expect(fakeSnrs.size).toBe(1);
        for (const row of rows.filter(r => real.some(c => c.prn === prnOf(r) && c.state === GPSSatelliteState.InUse))) {
            expect(snrOf(row)).toBe(Math.round(gps.signals.snr(prnOf(row))));
        }
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // At a power cycle while captured, the stored false position and the battery clock agree with the fake signals, and the
    // ephemeris collected from them is kept: the fake satellites come back with a hot start (design, "Acquisition of a fake
    // satellite"). The fake satellites are kept out of the solution here, so that the unit stays in ACQ for STA 1's list
    it('a power cycle while captured: the fake satellites are lost at once and come back hot', async () => {
        const {unit, site} = await capturedUnit();
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(90_000);
        const before = gps.channelRows().filter(r => r.fake && r.state === GPSSatelliteState.InUse).map(r => r.prn);
        expect(before.length).toBe(8); // Precondition

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(60_000);
        keepFakesOutOfSolution(unit);
        await unit.panel.powerOn();
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        expect(Array.from({length: 32}, (_, i) => i + 1).filter(prn => gps.fakeReceiver.isFakeInUse(prn))).toEqual([]);

        await vi.advanceTimersByTimeAsync(15_000);
        expect(gps.fakeReceiver.believesFalse).toBe(true);
        const sky = skyAt(unit, site.falseLat, site.falseLon, gps.simTimeUnix + CAPTURE_SHIFT_MS);
        const fakeInUse = gps.channelRows().filter(r => r.fake && r.state === GPSSatelliteState.InUse).map(r => r.prn);
        // Only a fake satellite whose ephemeris the receiver collected from this spoofer can be in use within the hot time
        // (any other takes the idle time and an ephemeris download). The fake sky has more PRNs than channels, so a channel
        // may go to another PRN of it
        expect(fakeInUse.length).toBeGreaterThanOrEqual(6);
        expect(fakeInUse.filter(prn => !before.includes(prn))).toEqual([]);
        expect(gps.isValid()).toBe(false); // Precondition: kept out of the solution

        // During ACQ STA 1 lists the satellites predicted for the stored position and the unit's clock (#213), here the
        // fake sky's: those whose fake signal a channel holds show it
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        await afterCalcTick(unit);
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // Precondition: the clock is hours off, so the start model searches on
        const flat = Math.round(60 - 10 * Math.log10(sky.size - 1));
        const rows = await satelliteRows(unit);
        // The predicted list has its own choice of up to eight satellites (GpsSearch), so the two lists overlap in part
        const held = rows.filter(r => fakeInUse.includes(prnOf(r)));
        expect(held.length).toBeGreaterThanOrEqual(4);
        expect(held.map(r => `${r[0]}${snrOf(r)}`)).toEqual(held.map(() => ` ${flat}`));
        expect(rows.filter(r => !fakeInUse.includes(prnOf(r))).map(r => `${r[0]}${snrOf(r)}`)).toEqual(rows.filter(r => !fakeInUse.includes(prnOf(r))).map(() => '*0'));
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "Shared PRNs": before a search of the whole sky the receiver finds only the fake satellites of PRNs up in both
    // its believed sky and the fake sky; with a shift of 12 hours almost none. A blind search finds every fake PRN
    it.each([
        ['an almanac search', {lastAlmanacDownload: DEFAULT_START.getTime() - 200 * DAY}, 0, SearchMode.AlmanacSearch],
        ['a sky search after the predicted satellites were not there', {lastAlmanacDownload: DEFAULT_START.getTime() - DAY}, 20 * 60 * 1000, SearchMode.SkySearch],
    ])('in %s every fake PRN is searched, also those the almanac does not predict', async (_, storage, clockOffMs, mode) => {
        const site = spoofer(200, 5, spooferPowerDb(300), 12 * 3600 * 1000);
        const unit = await bootUnit({engineRunning: false, storage: {...STORED_HOME, fastGpsAcquisition: false, ...storage, ...spooferAt(site)}});
        const gps = unit.props.sensors.in.gps;
        keepFakesOutOfSolution(unit); // A fix from the shared PRNs' fake satellites would end the search
        gps.timeZulu.setTimestamp(gps.timeZulu.getTimestamp() + clockOffMs);
        await unit.panel.powerOn();
        for (let s = 0; s < 400 && gps.search.mode !== mode; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.search.mode).toBe(mode); // Precondition
        const believed = skyAt(unit, HOME.lat, HOME.lon, gps.simTimeUnix);
        const shared = [...skyAt(unit, site.falseLat, site.falseLon, gps.simTimeUnix + site.shiftMs).keys()].filter(prn => believed.has(prn));
        expect(shared.length).toBeLessThan(8); // Precondition: the shared PRNs alone cannot fill the channels
        await vi.advanceTimersByTimeAsync(2000);

        const fake = gps.channelRows().filter(r => r.fake).map(r => r.prn);
        expect(fake.length).toBe(8);
        expect(fake.filter(prn => !believed.has(prn)).length).toBeGreaterThan(0);

        // The acquisition times of the search, as for a real satellite (GpsSearch): an almanac search's first satellite takes
        // 330 to 450 s, a sky search's 60 to 120 s. Only the PRNs the almanac does not predict are claimed by the search
        // alone; the shared ones may have been claimed in the tick before the start model began
        const blind = fake.filter(prn => !believed.has(prn));
        await vi.advanceTimersByTimeAsync(150_000);
        const stillSearched = gps.channelRows().filter(r => r.fake && blind.includes(r.prn) && r.state === GPSSatelliteState.None).map(r => r.prn);
        expect(stillSearched).toEqual(mode === SearchMode.AlmanacSearch ? blind : []);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The SDK's channel count is fixed: a channel the fake receiver claims is held off the SDK through the reachability
    // predicate (Gps.ts wrapReachability), so that the SDK does not track its satellite there
    it('a satellite the fake receiver claims is held lost: the SDK stops tracking it', async () => {
        const unit = await bootUnit({storage: STORED_HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const prn = gps.gpsSatComputer.getChannels().find(s => s !== null && s.state.get() === GPSSatelliteState.InUse)!.prn;
        vi.spyOn(gps.fakeReceiver, 'claimsSdkPrn').mockImplementation(p => p === prn);
        await vi.advanceTimersByTimeAsync(2000);

        const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
        expect(TRACKED.has(sat.state.get())).toBe(false);
        expect(gps.gpsSatComputer.getChannels().filter(s => s !== null && s.prn !== prn).every(s => s!.state.get() === GPSSatelliteState.InUse)).toBe(true);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // A channel searching a fake satellite is a satellite searched, as a lost one is (#467): ACQ, even where the SDK, far
    // from its last fix, no longer counts itself acquiring
    it('STA 1 shows ACQ while every channel searches or holds a fake satellite, 110 NM from the last fix', async () => {
        const site = spoofer(90, 55, spooferPowerDb(300), SHIFT_MS); // Halfway along the flight: every real satellite drowned throughout
        const unit = await bootUnit({
            altitudeFt: 10_000, storage: {...STORED_HOME, ...spooferAt(site)},
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 10_000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 1');
        const pos = await flyStraight(unit, HOME, 90, 3600, 110, 10_000);
        gps.coords.set(site.falseLat, site.falseLon);
        gps.timeZulu.setTimestamp(gps.simTimeUnix + SHIFT_MS);
        await flyStraight(unit, pos, 90, 3600, 2, 10_000);
        await afterCalcTick(unit);

        const rows = gps.channelRows();
        expect(gps.isValid()).toBe(false); // Preconditions: no fix, every channel a fake one, one of them searched
        expect(rows.length).toBe(8);
        expect(rows.every(r => r.fake)).toBe(true);
        expect(rows.some(r => r.state === GPSSatelliteState.None)).toBe(true);
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(gps.gpsSatComputer.state).not.toBe(GPSSystemState.Acquiring); // The SDK's own state would read INIT
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // A real satellite the SDK puts into a claimed channel is held lost there, so the SDK's 4-minute acquisition timeout
    // makes it Unreachable and keeps it out of its channel assignment for an hour, although the receiver never searched it.
    // Once it is out of the claimed channel and its own signal is fine, it is searchable again (FakeReceiver.freeHeld)
    it('a healthy real satellite held by a claim is not left Unreachable', async () => {
        const unit = await mixedPhaseUnit();
        const gps = unit.props.sensors.in.gps;
        let heldTimedOut = 0;
        const leftUnreachable = new Set<number>();
        for (let s = 0; s < 17 * 60; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            const channels = gps.gpsSatComputer.getChannels();
            const fakeRows = gps.channelRows().filter(r => r.fake).length;
            heldTimedOut += channels.filter(c => c !== null && c.state.get() === GPSSatelliteState.Unreachable && gps.fakeReceiver.claimsSdkPrn(c.prn)).length > 0 ? 1 : 0;
            for (const sat of gps.gpsSatComputer.getSatellites()) {
                if (sat.state.get() === GPSSatelliteState.Unreachable && !gps.signals.isLost(sat.prn) && !gps.fakeReceiver.claimsSdkPrn(sat.prn)) {
                    leftUnreachable.add(sat.prn);
                }
            }
            expect(fakeRows).toBeGreaterThan(0); // Precondition: the mixed phase lasts
        }
        expect(heldTimedOut).toBeGreaterThan(0); // Precondition: a held satellite timed out
        expect([...leftUnreachable]).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});
