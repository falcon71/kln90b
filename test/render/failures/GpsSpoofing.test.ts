import {afterEach, describe, expect, it, vi} from 'vitest';
import {LatLonInterface} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {flyStraight, jammerAt, spooferAt} from '../../harness/gps';
import {courseDeg, distanceNm, LatLon, pointFrom} from '../../harness/flight/geo';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {NO_ALTIMETER, panelXml} from '../../harness/panelXml';
import {dbToRatio, fakeSnr, jammerPowerDb, levelDb, spooferEdgeNm, spooferPowerDb} from '../../../kln90b/GpsTransmitter';
import {MASK_ZENITH_RAD} from '../../../kln90b/GpsSignal';
import {DEFAULT_FAKE_COUNT, SpooferSite, TransmitterSite} from '../../../kln90b/failures/Transmitters';
import {SearchMode} from '../../../kln90b/GpsSearch';
import {GPSEvents, KLNGPSSatComputer} from '../../../kln90b/Gps';
import {levelGainDb, powerForLevelDb} from '../../harness/transmitterGain';

/**
 * #465: flights into and out of a spoofer's range (design docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-
 * transmitters-design.md, "What the pilot sees", "Recovery", "Placement" and "Kept from the issue"). Nothing here is
 * scripted: the phases come from the distance, the radio horizon, the lock rule and the solution's vote
 */

const HOME: LatLon = {lat: 47, lon: 8};
const STORED_HOME = {lastLatitude: HOME.lat, lastLongitude: HOME.lon};
const POSITION_ERROR = 'RAIM POSITION ERROR CROSS CHECK POSITION';
const TIME_UPDATED = 'SYSTEM TIME UPDATED TO GPS TIME';
const POSITION_DIFFERS = 'POSITION DIFFERS FROM LAST POSITION BY >2NM';
const HOUR = 3600 * 1000;
const JET_FT = 35_000;
/** The jet's spoofer is this far east of HOME: inside its edge at FL350 (about 261 NM), so that a session keeps it, and outside the band of about 251 to 243 NM in which its fake signals drown the real satellites */
const JET_SPOOFER_NM = 258;

afterEach(() => {
    vi.restoreAllMocks();
});

/** On the SDK's earth (GA_RADIAN), as the unit measures */
const nmBetween = (a: LatLonInterface, b: LatLonInterface) => distanceNm(a, b);

/** The PRNs above the 5 degree mask at a place and time, as the SDK predicts them, apart from the unit's own predictions */
function skyAt(unit: HeadlessUnit, at: LatLon, time: number): Set<number> {
    const context = unit.props.sensors.in.gps.gpsSatComputer.createPredictionContext();
    context.setPosition(at.lat, at.lon, 0, time).predict();
    const sky = new Set<number>();
    for (const sat of context.getSatellites()) {
        if (sat.sbasGroup === undefined && sat.position.get()[0] < MASK_ZENITH_RAD) {
            sky.add(sat.prn);
        }
    }
    context.destroy();
    return sky;
}

/** The PRNs up in both the sky at HOME now and the spoofer's fake sky */
function sharedPrns(unit: HeadlessUnit, site: SpooferSite): number[] {
    const gps = unit.props.sensors.in.gps;
    const believed = skyAt(unit, HOME, gps.simTimeUnix);
    return [...skyAt(unit, {lat: site.falseLat, lon: site.falseLon}, gps.simTimeUnix + site.shiftMs)].filter(prn => believed.has(prn));
}

/**
 * A spoofer of the weakest power the draw gives (capture at 300 NM in line of sight), JET_SPOOFER_NM east of HOME, its
 * false position 80 NM from it. The reference altitude FL350, as a session at that level has stored it
 */
function jetSpoofer(shiftMs: number): SpooferSite {
    const p = pointFrom(HOME, 90, JET_SPOOFER_NM);
    const f = pointFrom(p, 20, 80);
    return {lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: JET_FT, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs, clockM: 30_000};
}

/** An engine-running unit at HOME at FL350 with a fix and the stored spoofer; the fades and the estimate noise pinned */
async function jet(site: SpooferSite, panel: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        panelXml: panelXml(panel), altitudeFt: JET_FT, storage: {...STORED_HOME, ...spooferAt(site)},
        simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: JET_FT}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
    });
    await settle(unit);
    const gps = unit.props.sensors.in.gps;
    gps.signals.fadeScale = 0;
    gps.signals.jitterScale = 0;
    gps.fakeReceiver.jitterScale = 0;
    expect(gps.transmitters.spoofer).toEqual(site); // Precondition: the session keeps the stored spoofer
    return unit;
}

/** The rows of the unit's solution that are fake satellites, and those that are real */
function rowsOf(unit: HeadlessUnit): { fake: number, real: number } {
    const gps = unit.props.sensors.in.gps;
    const prns: readonly number[] = (gps as any).solutionPrns;
    const claims: Uint8Array = (gps as any).solutionClaims;
    let fake = 0;
    for (let i = 0; i < prns.length; i++) {
        fake += claims[i];
    }
    return {fake, real: prns.length - fake};
}

/** 200 NM from the jet's spoofer, well inside the band in which it drowns the real satellites at FL350 */
const INSIDE: LatLon = pointFrom(HOME, 90, JET_SPOOFER_NM - 200);

/** Whether the unit is captured: a fix from fake satellites alone, in every channel */
function isCaptured(unit: HeadlessUnit): boolean {
    const gps = unit.props.sensors.in.gps;
    const rows = rowsOf(unit);
    return gps.isValid() && rows.real === 0 && rows.fake === 8 && gps.fakeReceiver.believesFalse;
}

/**
 * An engine-running unit in flight at a point, booted with a spoofer (and more failures) stored and the point as its last
 * position: the forced acquisition finds every real satellite drowned, and the fake satellites of the shared PRNs capture
 * the unit, which then searches the fake sky. Returns once every channel holds a fake satellite in use. The fades and the
 * estimate noise pinned
 */
async function capturedAt(at: LatLon, aglFt: number, site: SpooferSite, storage: Record<string, unknown> = {}, panel: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        panelXml: panelXml(panel), altitudeFt: aglFt, position: at,
        storage: {lastLatitude: at.lat, lastLongitude: at.lon, ...spooferAt(site), ...storage},
        simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: aglFt}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
    });
    const gps = unit.props.sensors.in.gps;
    gps.signals.fadeScale = 0;
    gps.signals.jitterScale = 0;
    gps.fakeReceiver.jitterScale = 0;
    for (let s = 0; s < 20 * 60 && !isCaptured(unit); s++) {
        await flyStraight(unit, at, 0, 0, 1, aglFt);
    }
    expect(isCaptured(unit)).toBe(true); // Precondition
    expect(gps.transmitters.spoofer).toEqual(site);
    return unit;
}

/** capturedAt INSIDE at FL350 with the jet's spoofer */
const capturedJet = (site: SpooferSite, panel: Record<string, unknown> = {}) => capturedAt(INSIDE, JET_FT, site, {}, panel);

describe('flying into a spoofer (#465)', () => {
    // At 450 kt on a track 60 degrees off the spoofer's bearing the aircraft closes at about 225 kt: the band in which the real
    // satellites drown takes about two minutes, longer than a fake satellite takes to be in use (IDLE_ACQUISITION and the
    // ephemeris, about 70 s). Straight in, the real satellites are all gone before the first fake one is in use, and the
    // position jumps from the true one to the false one with no mixed phase between
    it('flying into a spoofer: the real satellites drowned, a mixed phase with RAIM POSITION ERROR, then capture: the false position, ground speed 0, SYSTEM TIME UPDATED', async () => {
        const site = jetSpoofer(2 * HOUR);
        const unit = await jet(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        const falsePosition = {lat: site.falseLat, lon: site.falseLon};
        expect(sharedPrns(unit, site).length).toBeGreaterThanOrEqual(4); // Precondition: many shared PRNs
        expect(gps.solution.altitudeAided).toBe(false);
        const inView: number[] = [...(gps as any).solutionPrns];
        expect(inView.length).toBe(8); // Precondition: eight real satellites in use, none lost

        let drowned = -1;
        let mixed = -1;
        let positionError = -1;
        let timeUpdated = -1;
        let capture = -1;
        let mixedOffNm = 0;
        let clockAtCaptureMs = NaN;
        let pos = HOME;
        for (let s = 1; s <= 600 && capture < 0; s++) {
            pos = await flyStraight(unit, pos, 150, 450, 1, JET_FT);
            const rows = rowsOf(unit);
            const msgs = messages(unit);
            if (drowned < 0 && inView.some(prn => gps.signals.isLost(prn))) {
                drowned = s;
            }
            if (gps.isValid() && rows.fake > 0 && rows.real > 0) {
                mixed = mixed < 0 ? s : mixed;
                mixedOffNm = Math.max(mixedOffNm, Math.min(nmBetween(gps.coords, pos), nmBetween(gps.coords, falsePosition)));
            }
            if (positionError < 0 && msgs.includes(POSITION_ERROR)) {
                positionError = s;
            }
            if (timeUpdated < 0 && msgs.includes(TIME_UPDATED)) {
                timeUpdated = s;
            }
            if (gps.isValid() && rows.real === 0 && rows.fake >= 4) {
                capture = s;
                clockAtCaptureMs = gps.timeZulu.getTimestamp() - gps.simTimeUnix;
            }
        }

        expect(drowned).toBeGreaterThan(0);
        expect(mixed).toBeGreaterThan(drowned);
        expect(positionError).toBeGreaterThanOrEqual(mixed);
        expect(timeUpdated).toBeGreaterThan(mixed);
        expect(capture).toBeGreaterThanOrEqual(timeUpdated);
        expect(positionError).toBeLessThan(capture);
        expect(mixedOffNm).toBeGreaterThan(2); // The mixed position is neither the true nor the false one
        // Captured: the false position, standing still, the false time
        expect(nmBetween(gps.coords, falsePosition)).toBeLessThan(0.01);
        expect(gps.groundspeed).toBe(0);
        expect(Math.abs(clockAtCaptureMs - 2 * HOUR)).toBeLessThan(1000);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Design, "Shared PRNs" and "Recovery": with a shift of 12 hours the drowned receiver finds almost no fake satellite among
    // the PRNs it searches, so it has no fix until it gives up on its prediction after 5 minutes and searches the whole sky.
    // Straight in at 450 kt, the aircraft stays well inside the spoofer's range for the whole search
    it('with few shared PRNs: no fix until the sky search, then capture', async () => {
        const site = jetSpoofer(12 * HOUR);
        const unit = await jet(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        expect(sharedPrns(unit, site).length).toBeLessThan(4); // Precondition: few shared PRNs

        let fixLost = -1;
        let skySearch = -1;
        let validBeforeSkySearch = 0;
        let capture = -1;
        let pos = HOME;
        for (let s = 1; s <= 30 * 60 && capture < 0; s++) {
            pos = await flyStraight(unit, pos, 90, 450, 1, JET_FT);
            const rows = rowsOf(unit);
            if (fixLost < 0 && !gps.isValid()) {
                fixLost = s;
            }
            if (fixLost > 0 && skySearch < 0 && gps.search.mode === SearchMode.SkySearch) {
                skySearch = s;
            }
            if (fixLost > 0 && skySearch < 0 && gps.isValid()) {
                validBeforeSkySearch++;
            }
            if (gps.isValid() && rows.real === 0 && rows.fake >= 4) {
                capture = s;
            }
        }

        expect(fixLost).toBeGreaterThan(0);
        expect(validBeforeSkySearch).toBe(0);
        expect(skySearch).toBeGreaterThan(fixLost);
        expect(capture).toBeGreaterThan(skySearch);
        expect(capture - fixLost).toBeGreaterThanOrEqual(5 * 60);
        expect(capture - fixLost).toBeLessThanOrEqual(20 * 60);
        expect(nmBetween(gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Design, "RAIM detection": the altitude input disagrees with the fake rows by the aircraft's height above the false
    // ground, here FL350 over a false airport at sea level. The unit holds the solution with the altitude (NAV A, 5-29)
    it('captured with an altitude input: RAIM POSITION ERROR and STATE NAV A for as long as it is captured', async () => {
        const unit = await capturedJet(jetSpoofer(2 * HOUR));
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 1');
        expect(gps.solution.altitudeAided).toBe(true); // Precondition

        const states: string[] = [];
        let pos = INSIDE;
        for (let s = 0; s < 5 * 60; s++) {
            pos = await flyStraight(unit, pos, 270, 450, 1, JET_FT);
            await vi.advanceTimersByTimeAsync(250);
            const msg = messages(unit).includes(POSITION_ERROR);
            states.push(`${isCaptured(unit)} ${msg} ${Screen.read().rows('L')[0]}`);
        }
        expect(new Set(states)).toEqual(new Set(['true true STATE NAV A']));
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Design, "What the pilot sees" and "Recovery": flying out at 1 NM a tick, the fake satellites fade below the lock rule
    // and are lost; the spoofer is left only beyond the distance where its fake signals are 5 dB below that (controller ruling
    // I), and replaced. The unit's belief is the false position and two hours ahead, far from the truth, so the receiver starts
    // its search again from it (ACQ), finds nothing it predicts, and after 5 minutes searches the whole sky. The aircraft then
    // descends to 5,000 ft and holds there, beyond the radio horizon of the new spoofer placed ahead
    it('flying out: the fake satellites lost, the true position back, SYSTEM TIME UPDATED again', async () => {
        const site = jetSpoofer(2 * HOUR);
        const unit = await capturedJet(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        const published: number[] = [];
        unit.core.bus.getSubscriber<GPSEvents>().on('timeUpdatedEvent').handle(t => published.push(t.getTimestamp() - gps.simTimeUnix));
        published.length = 0; // The subscription replays the capture's
        expect(messages(unit).filter(m => m === TIME_UPDATED).length).toBe(1); // Precondition: the one of the capture
        const captured = gps.fakeReceiver.inUsePrns().slice();

        let pos = INSIDE;
        let fakesLost = -1;
        let snrAtLoss = NaN;
        let replaced = -1;
        let lastSnr = NaN;
        for (let s = 1; s <= 120 && replaced < 0; s++) {
            pos = await flyStraight(unit, pos, 270, 3600, 1, JET_FT);
            if (fakesLost < 0 && gps.channelRows().every(r => !r.fake)) {
                fakesLost = s;
                snrAtLoss = gps.fakeReceiver.snr(captured[0]);
            }
            if (gps.transmitters.spoofer === null || gps.transmitters.spoofer.lat !== site.lat) {
                replaced = s;
            } else {
                lastSnr = gps.fakeReceiver.snr(captured[0]);
            }
        }
        expect(fakesLost).toBeGreaterThan(0);
        expect(snrAtLoss).toBeLessThan(30); // Lost by the lock rule
        expect(replaced).toBeGreaterThan(fakesLost); // Before the spoofer was left
        expect(lastSnr).toBeLessThan(26); // Left only near fake SNR 25, about 2.5 NM a tick of diffraction
        expect(gps.isValid()).toBe(false); // The fix went with them
        const modes: SearchMode[] = [gps.search.mode];
        let fix = -1;
        for (let s = 1; s <= 20 * 60 && fix < 0; s++) {
            await flyStraight(unit, pos, 270, 0, 1, 5000);
            if (modes[modes.length - 1] !== gps.search.mode) {
                modes.push(gps.search.mode);
            }
            if (gps.isValid()) {
                fix = s;
            }
            expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        }

        expect(modes).toEqual([SearchMode.Acquisition, SearchMode.SkySearch, SearchMode.Idle]);
        expect(rowsOf(unit).fake).toBe(0);
        expect(nmBetween(gps.coords, pos)).toBeLessThan(0.01);
        expect(Math.abs(gps.timeZulu.getTimestamp() - gps.simTimeUnix)).toBeLessThan(1000);
        expect(published.length).toBe(1);
        expect(Math.abs(published[0])).toBeLessThan(1000);
        expect(messages(unit).filter(m => m === TIME_UPDATED).length).toBe(2);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Design, "Placement" and controller rulings H and I: a spoofer is left once the aircraft is beyond its leave edge at the
    // reference altitude (fake SNR 25); a new one is generated at once, ahead on the track within 30 degrees, where its fake
    // SNR at the present height is 35 to 38: acquirable, but its noise rise under 1 dB, so the real satellites stay
    it('a new spoofer ahead after leaving', async () => {
        const site = jetSpoofer(2 * HOUR);
        const unit = await jet(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        const inView: number[] = [...(gps as any).solutionPrns];
        // The leave edge is the one for the fake count known at the load: the default, as no fake sky was known at the boot
        const leaveNm = spooferEdgeNm(site.powerDb, DEFAULT_FAKE_COUNT, JET_FT, 25);
        expect(leaveNm).toBeGreaterThan(JET_SPOOFER_NM); // Precondition: the session started inside its range

        let pos = HOME;
        let placedFrom: LatLon | null = null;
        for (let s = 1; s <= 120 && placedFrom === null; s++) {
            const from = pos;
            pos = await flyStraight(unit, pos, 270, 450, 1, JET_FT);
            if (gps.transmitters.spoofer === null || gps.transmitters.spoofer.lat !== site.lat) {
                placedFrom = pos;
                expect(nmBetween(from, site)).toBeLessThanOrEqual(leaveNm); // Left in this tick, not before
            }
        }
        expect(placedFrom).not.toBeNull();
        expect(nmBetween(placedFrom!, site)).toBeGreaterThan(leaveNm);
        await vi.advanceTimersByTimeAsync(0); // The airport search
        const fresh = {...gps.transmitters.spoofer!};
        const off = Math.abs(courseDeg(placedFrom!, fresh) - 270);
        expect(Math.min(off, 360 - off)).toBeLessThanOrEqual(30.5);
        const n = gps.transmitters.spooferFakeCount;
        const placedNm = nmBetween(placedFrom!, fresh);
        const snr = fakeSnr(dbToRatio(levelDb(fresh.powerDb, placedNm, JET_FT, levelGainDb(placedNm, JET_FT))) / n, n, 0);
        expect(snr).toBeGreaterThan(35 - 0.01);
        expect(snr).toBeLessThan(38 + 0.01);
        expect(unit.props.failures.values('gpsSpoofing')).toEqual(fresh); // Stored for the next session

        await flyStraight(unit, placedFrom!, 270, 0, 5, JET_FT);
        expect(gps.transmitters.spoofer).toEqual(fresh); // Precondition: sending
        expect(inView.filter(prn => gps.signals.isLost(prn))).toEqual([]); // Not noticeable yet
        expect(gps.isValid()).toBe(true);
        expect(rowsOf(unit).real).toBe(8);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

describe('jamming and spoofing together (#465)', () => {
    // Design, "Jamming and spoofing together": the jammer's level lowers the fake satellites as it lowers the real ones, with no
    // rule for the combination. At 10,000 ft a spoofer 100 NM south and a jammer 100 NM to the east-south-east, 100 NM from
    // each other, their powers set from their levels with the test harness's gain. The fake signals are 28 dB over the noise
    // along the way (one of eight 19 dB), the jammer 30 dB at HOME: the fake SNR there is 79 - 10 log10(1 + 10^3 + 7 x
    // 10^1.9) = 47, and the unit is captured. Over the jammer, 1 NM from it, its level is 22.2 dB higher (34.4 dB of spreading
    // less the 12.2 dB the antenna loses toward the nadir), 52.2 dB: the fake SNR falls to 27, under the lock-loss level
    it('jamming and spoofing together: captured far from the jammer, no fix near it', async () => {
        const s = pointFrom(HOME, 180, 100);
        const f = pointFrom(s, 200, 60);
        const site: SpooferSite = {lat: s.lat, lon: s.lon, powerDb: powerForLevelDb(28, 100, 10_000), refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 2 * HOUR, clockM: 0};
        const j = pointFrom(HOME, 120, 100);
        const jam: TransmitterSite = {lat: j.lat, lon: j.lon, powerDb: powerForLevelDb(30, 100, 10_000), refAglFt: 10_000};
        const unit = await capturedAt(HOME, 10_000, site, jammerAt(jam), NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        expect(gps.transmitters.jammer).toEqual(jam); // Preconditions: both stored transmitters kept, the jammer heard
        expect(gps.transmitters.jammerRatio).toBeGreaterThan(1);
        expect(nmBetween(gps.coords, f)).toBeLessThan(0.01); // Captured far from the jammer

        let pos = HOME;
        const near: { nm: number, valid: boolean, fakes: number }[] = [];
        let track = courseDeg(HOME, j);
        for (let t = 1; t <= 120; t++) {
            track = courseDeg(pos, j); // Homing: over 100 NM a constant course would pass it by
            pos = await flyStraight(unit, pos, track, 3600, 1, 10_000);
            if (nmBetween(pos, j) < 1) {
                near.push({nm: nmBetween(pos, j), valid: gps.isValid(), fakes: gps.channelRows().filter(r => r.fake).length});
                pos = await flyStraight(unit, pos, track, 0, 5, 10_000); // Holding over it
                near.push({nm: nmBetween(pos, j), valid: gps.isValid(), fakes: gps.channelRows().filter(r => r.fake).length});
                break;
            }
        }
        expect(near.length).toBeGreaterThan(0); // Precondition: over the jammer
        expect(near.filter(n => n.valid || n.fakes > 0)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

/**
 * In flight at 10,000 ft over HOME, 80 NM from a spoofer whose fake signals together are 11.5 dB over the noise there (the
 * power from the test harness's gain), without a time shift: the low real satellites are drowned and fake ones take their
 * channels, the high real ones stay. Four of each: the tie gives the true
 * reference state, moved by the fake rows' errors (design, "The solution"), which RAIM detects. Returns once the mixed
 * solution shows RAIM POSITION ERROR
 */
async function mixedPhaseUnit(): Promise<HeadlessUnit> {
    const p = pointFrom(HOME, 200, 80);
    const f = pointFrom(p, 20, 60);
    const site: SpooferSite = {lat: p.lat, lon: p.lon, powerDb: powerForLevelDb(11.5, 80, 10_000), refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 0, clockM: 50_000};
    const unit = await bootUnit({
        altitudeFt: 10_000, storage: {...STORED_HOME, ...spooferAt(site)},
        simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 10_000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
    });
    const gps = unit.props.sensors.in.gps;
    gps.signals.fadeScale = 0;
    gps.signals.jitterScale = 0;
    gps.fakeReceiver.jitterScale = 0;
    const mixed = () => gps.isValid() && rowsOf(unit).fake > 0 && rowsOf(unit).real > 0 && messages(unit).includes(POSITION_ERROR);
    for (let t = 0; t < 600 && !mixed(); t++) {
        await flyStraight(unit, HOME, 0, 0, 1, 10_000);
    }
    expect(mixed()).toBe(true); // Precondition
    expect(nmBetween(gps.coords, HOME)).toBeGreaterThan(2);
    return unit;
}

/** What the unit holds of the spoofer and its solution: one snapshot, copied */
function snapshot(unit: HeadlessUnit): unknown {
    const gps = unit.props.sensors.in.gps;
    return {
        lat: gps.coords.lat, lon: gps.coords.lon, time: gps.timeZulu.getTimestamp(), valid: gps.isValid(), groundspeed: gps.groundspeed,
        rows: gps.channelRows().map(r => ({...r})), solution: [...(gps as any).solutionPrns], claims: [...(gps as any).solutionClaims],
        northM: gps.rangeErrors.northM, eastM: gps.rangeErrors.eastM, sseM2: gps.rangeErrors.sseM2,
        spoofer: {...gps.transmitters.spoofer!}, ratio: gps.transmitters.spooferRatio, messages: messages(unit),
    };
}

/** The PRNs whose fake satellite claims a channel, or whose real one the claims hold lost */
const claimedPrns = (unit: HeadlessUnit) => Array.from({length: 32}, (_, i) => i + 1).filter(prn => unit.props.sensors.in.gps.fakeReceiver.claimsSdkPrn(prn));

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second, below its header) */
async function sta1Rows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    if (Screen.read().status().left !== 'STA+1') {
        return first.filter(r => r.trim() !== '');
    }
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').slice(1).filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

describe('a spoofer across power and hot swapping (#465)', () => {
    // Design, "Acquisition of a fake satellite" and "Kept from the issue": at a power cycle while captured, the stored false
    // position and the battery clock agree with the fake signals, and the fake ephemeris is kept, so the fake satellites come
    // back with the hot start's time (HOT_ACQUISITION, 9 s and a range of 6 s), well before an idle search (40 s) and its
    // ephemeris (30 s) could. The stored position is the false one, so the first fix does not differ from it (B-3). REAL
    // acquisition: FAST sets the memory to the true state at a power-on (#468), which the fake signals then contradict
    it('a power cycle while captured: the fake satellites come back with hot times and the false position, no POSITION DIFFERS message', async () => {
        const site = jetSpoofer(2 * HOUR);
        const unit = await capturedAt(INSIDE, JET_FT, site, {fastGpsAcquisition: false}, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        await flyStraight(unit, INSIDE, 0, 0, 65, JET_FT); // Past a save of the position (every 60 s)
        expect(unit.props.userSettings.getSetting('lastLatitude').get()).toBeCloseTo(site.falseLat, 6); // Precondition

        await unit.panel.powerOff();
        await flyStraight(unit, INSIDE, 0, 0, 60, JET_FT);
        await unit.panel.powerOn();
        let s = 0;
        for (; s < 120 && !gps.isValid(); s++) {
            await flyStraight(unit, INSIDE, 0, 0, 1, JET_FT);
        }

        expect(s).toBeLessThanOrEqual(20);
        expect(rowsOf(unit).real).toBe(0);
        expect(rowsOf(unit).fake).toBeGreaterThanOrEqual(4);
        expect(nmBetween(gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.01);
        expect(Math.abs(gps.timeZulu.getTimestamp() - (gps.simTimeUnix + 2 * HOUR))).toBeLessThan(1000);
        await flyStraight(unit, INSIDE, 0, 0, 5, JET_FT);
        expect(messages(unit)).not.toContain(POSITION_DIFFERS);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Hot swapping (wiki "Hot Swapping"): L:KLN90B_Disabled stops the calculation ticks. Nothing of the spoofer, the fake
    // satellites or the mixed solution moves while they stand, and the ticks resume without an error
    it('a hot swap disable and resume while in the mixed phase changes nothing while disabled and throws nothing', async () => {
        const unit = await mixedPhaseUnit();
        const before = snapshot(unit);

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await flyStraight(unit, HOME, 0, 0, 120, 10_000);
        expect(snapshot(unit)).toEqual(before);

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await flyStraight(unit, HOME, 0, 0, 30, 10_000);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(rowsOf(unit).fake).toBeGreaterThan(0);
        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
    }, 120_000);
});

describe('repairing a spoofer (#465)', () => {
    // Design, "Placement": the repair removes the transmitter at once. Its fake satellites go in the same calculation tick,
    // with their claims on the channels and their rows; with only real rows left, RAIM sees nothing. STA 1 shows the
    // channels as of the last calculation tick, so the next display tick has no fake satellite
    it('a repair in the mixed phase removes the fake rows, the claims and RAIM POSITION ERROR in the same tick; STA 1 shows no fake satellite at the next display tick', async () => {
        const unit = await mixedPhaseUnit();
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 1');
        await untilCalcTick(unit);
        const fakeOnly = gps.channelRows().filter(r => r.fake && !gps.gpsSatComputer.getChannels().some(c => c?.prn === r.prn)).map(r => r.prn);
        expect(claimedPrns(unit).length).toBeGreaterThan(0); // Preconditions
        expect(fakeOnly.length).toBeGreaterThan(0);

        unit.props.failures.repair('gpsSpoofing');
        await untilCalcTick(unit);

        expect(rowsOf(unit).fake).toBe(0);
        expect(gps.fakeReceiver.inUsePrns()).toEqual([]);
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        expect(claimedPrns(unit)).toEqual([]);
        expect(gps.rangeErrorDetected(2)).toBe(false);
        expect(messages(unit)).not.toContain(POSITION_ERROR);

        await vi.advanceTimersByTimeAsync(250);
        const shown = (await sta1Rows(unit)).map(r => Number(r.slice(1, 3)));
        expect(shown).toEqual(gps.channelRows().map(r => r.prn).sort((a, b) => a - b));
        expect(shown.filter(prn => fakeOnly.includes(prn))).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

describe('jamming and spoofing repaired apart (#465)', () => {
    /** Both failures at HOME at 10,000 ft: the spoofer of 'jamming and spoofing together', the jammer 40 NM east, captured */
    async function bothActive(): Promise<HeadlessUnit> {
        const s = pointFrom(HOME, 180, 125);
        const f = pointFrom(s, 200, 60);
        const site: SpooferSite = {lat: s.lat, lon: s.lon, powerDb: spooferPowerDb(300), refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 2 * HOUR, clockM: 0};
        const j = pointFrom(HOME, 100, 40);
        return capturedAt(HOME, 10_000, site, jammerAt({lat: j.lat, lon: j.lon, powerDb: jammerPowerDb(250), refAglFt: 10_000}), NO_ALTIMETER);
    }

    // Review focus 5: each failure has its own transmitter, place and stored values (design, "Transmitters")
    it("with both failures active, repairing the spoofer leaves the jammer's site, its stored values and its effect unchanged", async () => {
        const unit = await bothActive();
        const gps = unit.props.sensors.in.gps;
        const site = {...gps.transmitters.jammer!};
        const stored = unit.props.failures.values('gpsJamming');
        const ratio = gps.transmitters.jammerRatio;
        expect(ratio).toBeGreaterThan(1); // Precondition

        unit.props.failures.repair('gpsSpoofing');
        await flyStraight(unit, HOME, 0, 0, 10, 10_000);

        expect(gps.transmitters.spoofer).toBeNull(); // Precondition
        expect(gps.transmitters.jammer).toEqual(site);
        expect(unit.props.failures.values('gpsJamming')).toEqual(stored);
        expect(gps.transmitters.jammerRatio).toBe(ratio);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    it("with both failures active, repairing the jammer leaves the spoofer's site, its stored values and its effect unchanged", async () => {
        const unit = await bothActive();
        const gps = unit.props.sensors.in.gps;
        const site = {...gps.transmitters.spoofer!};
        const stored = unit.props.failures.values('gpsSpoofing');
        const ratio = gps.transmitters.spooferRatio;

        unit.props.failures.repair('gpsJamming');
        await flyStraight(unit, HOME, 0, 0, 10, 10_000);

        expect(gps.transmitters.jammer).toBeNull(); // Precondition
        expect(gps.transmitters.spoofer).toEqual(site);
        expect(unit.props.failures.values('gpsSpoofing')).toEqual(stored);
        expect(gps.transmitters.spooferRatio).toBe(ratio);
        expect(isCaptured(unit)).toBe(true);
        expect(nmBetween(gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

describe('a spoofer across sessions (#465)', () => {
    // Design, "Placement" and "Kept from the issue": a session started inside the stored spoofer's range keeps it. The stored
    // position is the false one the last session navigated on, so the capture shows no POSITION DIFFERS. REAL acquisition, as
    // FAST sets the memory to the true state at a power-on (#468), from which the capture then differs
    it("a session started inside a stored spoofer's range keeps it", async () => {
        const site = jetSpoofer(2 * HOUR);
        const unit = await capturedAt(INSIDE, JET_FT, site, {lastLatitude: site.falseLat, lastLongitude: site.falseLon, fastGpsAcquisition: false}, NO_ALTIMETER);
        await flyStraight(unit, INSIDE, 0, 0, 5, JET_FT);

        expect(unit.props.failures.values('gpsSpoofing')).toEqual(site);
        expect(nmBetween(unit.props.sensors.in.gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.01);
        expect(messages(unit)).not.toContain(POSITION_DIFFERS);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // One started beyond the edge at the reference altitude gets a new spoofer, and its first fix differs from the stored
    // false position of the old one (REAL acquisition, as above)
    it('one started beyond its edge gets a new one', async () => {
        const site = jetSpoofer(2 * HOUR);
        const beyond = pointFrom(HOME, 270, 60); // 318 NM from the spoofer
        expect(nmBetween(beyond, site)).toBeGreaterThan(spooferEdgeNm(site.powerDb, DEFAULT_FAKE_COUNT, JET_FT, 25)); // Precondition: beyond the leave edge
        const unit = await bootUnit({
            panelXml: panelXml(NO_ALTIMETER), altitudeFt: JET_FT, position: beyond,
            storage: {lastLatitude: site.falseLat, lastLongitude: site.falseLon, fastGpsAcquisition: false, ...spooferAt(site)},
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: JET_FT}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        const gps = unit.props.sensors.in.gps;
        await flyStraight(unit, beyond, 0, 0, 5, JET_FT); // The forced acquisition of the boot came before the first calculation tick
        let s = 0;
        for (; s < 20 * 60 && !gps.isValid(); s++) {
            await flyStraight(unit, beyond, 0, 0, 1, JET_FT);
        }

        expect(gps.transmitters.spoofer).not.toBeNull();
        expect(gps.transmitters.spoofer!.lat).not.toBe(site.lat);
        expect(unit.props.failures.values('gpsSpoofing')).toEqual({...gps.transmitters.spoofer!});
        expect(gps.isValid()).toBe(true);
        expect(messages(unit)).toContain(POSITION_DIFFERS);
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

describe("the SDK's last known position (#465)", () => {
    /**
     * Records, at each update of the SDK's receiver and before it, how far the SDK's last known position is from the true
     * position: the distance its 100 NM rule judges. Installed on the prototype before the boot, so that the boot's updates
     * are seen too. The context is private in the SDK
     */
    function recordLastKnown(): number[] {
        const original = KLNGPSSatComputer.prototype.onUpdate;
        const nm: number[] = [];
        vi.spyOn(KLNGPSSatComputer.prototype, 'onUpdate').mockImplementation(function (this: KLNGPSSatComputer) {
            const known = (this as any).activeSimulationContext.lastKnownPosition;
            const here = {lat: SimVar.GetSimVarValue('PLANE LATITUDE', 'degrees'), lon: SimVar.GetSimVarValue('PLANE LONGITUDE', 'degrees')};
            nm.push(isNaN(known.lat) ? NaN : nmBetween(known, here));
            original.call(this);
        });
        return nm;
    }

    // Design, "Kept from the issue": the SDK's last known position always gets the true position, where Gps.tick syncs it
    // for a fix the SDK has no solution of its own for. Captured, every channel is a fake satellite, so it is synced in every
    // tick, here while the aircraft moves at 450 kt
    it("the SDK's last known position stays the true one while captured", async () => {
        const unit = await capturedJet(jetSpoofer(2 * HOUR), NO_ALTIMETER);
        const synced: number[] = [];
        let pos = INSIDE;
        for (let s = 0; s < 60; s++) {
            pos = await flyStraight(unit, pos, 270, 450, 1, JET_FT);
            const known = (unit.props.sensors.in.gps.gpsSatComputer as any).activeSimulationContext.lastKnownPosition;
            synced.push(nmBetween(known, pos));
            expect(isCaptured(unit)).toBe(true); // Precondition
        }
        expect(synced.filter(nm => !(nm < 0.001))).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // The false position here is 270 NM from the aircraft. Beyond 100 NM of its last known position the SDK offers no
    // satellite for a free channel and searches blind (design, "Kept from the issue"). The stored position of a captured
    // unit is the false one, and the receiver's constructor and the start model (GpsSearch, #62) sync it, but the start model
    // takes the present position for a stored one beyond 100 NM. Within 100 NM it keeps the stored one for the SDK's 2 NM
    // hot-start rule, on purpose. So no update of the SDK ever sees a position that far off: neither in a session started
    // after a captured one, nor after a power cycle while captured. REAL acquisition, as FAST writes the truth (#468)
    it("a session after a captured one and a power cycle while captured give the SDK no last known position beyond 100 NM", async () => {
        const site = jetSpoofer(2 * HOUR);
        expect(nmBetween({lat: site.falseLat, lon: site.falseLon}, INSIDE)).toBeGreaterThan(100); // Precondition
        const recorded = recordLastKnown();
        const unit = await capturedAt(INSIDE, JET_FT, site, {lastLatitude: site.falseLat, lastLongitude: site.falseLon, fastGpsAcquisition: false}, NO_ALTIMETER);
        await flyStraight(unit, INSIDE, 0, 0, 5, JET_FT);
        await unit.panel.powerOff();
        await flyStraight(unit, INSIDE, 0, 0, 60, JET_FT);
        await unit.panel.powerOn();
        await flyStraight(unit, INSIDE, 0, 0, 60, JET_FT);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // Precondition: captured again after the power cycle
        expect(rowsOf(unit).real).toBe(0);
        expect(unit.props.sensors.in.gps.fakeReceiver.believesFalse).toBe(true);
        expect(recorded.length).toBeGreaterThan(60);
        expect(recorded.filter(nm => !(nm < 100))).toEqual([]); // NaN (none) would be the SDK's blind search too
        expect(unit.errors).toEqual([]);
    }, 120_000);
});

describe('take-home mode (#465)', () => {
    // Take-home mode has no receiver failures (#460) and no transmitters: a stored spoofer close by is not loaded and sends
    // nothing. The unit flies on its stored position and clock as always
    it('take-home mode: a stored spoofer does nothing', async () => {
        const p = pointFrom(HOME, 200, 5);
        const f = pointFrom(p, 20, 60);
        const site: SpooferSite = {lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 2 * HOUR, clockM: 0};
        const unit = await bootUnit({panelXml: panelXml({TakeHomeMode: true}), storage: {...STORED_HOME, ...spooferAt(site)}});
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(120_000);

        expect(unit.props.failures.isActive('gpsSpoofing')).toBe(true); // Precondition: the failure is stored
        expect(gps.transmitters.spoofer).toBeNull();
        expect(gps.transmitters.spooferRatio).toBe(0);
        expect(gps.fakeReceiver.fakeSkyCount).toBe(0);
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        expect(gps.isValid()).toBe(true);
        expect(nmBetween(gps.coords, HOME)).toBeLessThan(0.01);
        expect(Math.abs(gps.timeZulu.getTimestamp() - gps.simTimeUnix)).toBeLessThan(5000);
        expect(messages(unit)).not.toContain(TIME_UPDATED);
        expect(unit.props.failures.values('gpsSpoofing')).toEqual(site); // Nothing drawn or saved over it
        expect(unit.errors).toEqual([]);
    }, 120_000);
});
