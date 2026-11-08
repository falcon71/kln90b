import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {messages} from '../../harness/readers';
import {panelXml} from '../../harness/panelXml';
import {flyStraight, jammerAt, secondsToFix, spooferAt} from '../../harness/gps';
import {courseDeg, distanceNm, LatLon, pointFrom} from '../../harness/flight/geo';
import {GPS} from '../../../kln90b/Gps';
import {Raim, raimStatus} from '../../../kln90b/GpsSolution';
import {IDLE_ACQUISITION, WARM_ACQUISITION_RANGE} from '../../../kln90b/GpsSearch';
import {halForMode} from '../../../kln90b/services/ModeController';
import {
    dbToRatio,
    fakeSnr,
    jammerEdgeNm,
    jammerPowerDb,
    levelDb,
    noiseRiseDb,
    spooferPowerDb,
} from '../../../kln90b/GpsTransmitter';
import {MASK_ZENITH_RAD, MAX_SIGNAL_STEP_S} from '../../../kln90b/GpsSignal';
import {TransmitterSite} from '../../../kln90b/failures/Transmitters';
import {NearestAirportFinder} from '../../../kln90b/data/navdata/NearestAirportFinder';
import {abeamElevationDeg, gainAtElevationDb, levelGainDb, powerForLevelDb} from '../../harness/transmitterGain';

/**
 * #465: jamming from a ground transmitter and what STA 1 shows of it (the design
 * docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md, "Transmitters", "Power", "The noise floor
 * and the real satellites", "What the pilot sees" and "Placement"). The jammer's level at the aircraft raises the noise
 * floor of every satellite, so the satellites go weakest first as the aircraft closes in. The satellites a jammer takes
 * stay on STA 1 as "searched, not found" (*xx 00, Pilot's Guide 5-29, 5-30; Installation Manual C-7)
 */

const COVERAGE = 'SATELLITE COVERAGE INADEQUATE FOR NAV';
const RAIM_MESSAGE = 'RAIM NOT AVAILABLE CROSS CHECK POSITION';
const SIGNAL_MESSAGES = [COVERAGE, RAIM_MESSAGE, 'BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE', 'BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE'];

const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);
const byNumber = (a: number, b: number) => a - b;

/** Where the units boot, and the position stored at the last power-off, so that no boot posts POSITION DIFFERS */
const HOME: LatLon = {lat: 47, lon: 8};
const STORED_HOME = {lastLatitude: HOME.lat, lastLongitude: HOME.lon};

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

const satellite = (unit: HeadlessUnit, prn: number): GPSSatellite =>
    unit.props.sensors.in.gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
/** Degrees above the horizon from the SDK's zenith angle, as STA 1 rounds it */
const elevation = (unit: HeadlessUnit, prn: number): number => Math.round(90 - satellite(unit, prn).position.get()[0] * 180 / Math.PI);
/** The row of a satellite that is searched and not found: *, the PRN, SNR 00 and its elevation */
const searchedRow = (unit: HeadlessUnit, prn: number) => `*${String(prn).padStart(2, '0')}  00 ${String(elevation(unit, prn)).padStart(2, '0')}°`;

/** The satellites the SDK has in use, by PRN */
const inUse = (unit: HeadlessUnit) => unit.props.sensors.in.gps.gpsSatComputer.getSatellites()
    .filter(s => s.state.get() === GPSSatelliteState.InUse || s.state.get() === GPSSatelliteState.InUseDiffApplied).map(s => s.prn).sort(byNumber);
/** The satellites above the receiver's mask of 5 degrees, by PRN */
const visible = (unit: HeadlessUnit) => unit.props.sensors.in.gps.gpsSatComputer.getSatellites()
    .filter(s => s.position.get()[0] < MASK_ZENITH_RAD).map(s => s.prn).sort(byNumber);
/** The satellites in the receiver's channels, by PRN */
const inChannels = (unit: HeadlessUnit) => unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null).map(s => s!.prn).sort(byNumber);

/** A jammer at a distance and bearing from a point, its power drawn so that it first takes the weakest satellite at firstLossNm (GpsTransmitter, "Power") */
function jammer(from: LatLon, bearing: number, nm: number, firstLossNm: number): TransmitterSite {
    const p = pointFrom(from, bearing, nm);
    return {lat: p.lat, lon: p.lon, powerDb: jammerPowerDb(firstLossNm), refAglFt: 10_000};
}

/** Switches gpsJamming on in flight with this jammer, as a session that stored it would load it: the next calculation tick takes it */
function startJamming(unit: HeadlessUnit, site: TransmitterSite): void {
    unit.props.failures.fail('gpsJamming');
    unit.props.failures.setValues('gpsJamming', {lat: site.lat, lon: site.lon, powerDb: site.powerDb, refAglFt: site.refAglFt});
}

/** An engine-running unit at HOME, at a height above the ground (the fixtures' ground is at 0), with a fix; the fade and the estimate noise pinned */
async function unitInFlight(aglFt: number, extra: { antennaAttitude?: boolean } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        altitudeFt: aglFt, storage: STORED_HOME, antennaAttitude: extra.antennaAttitude,
        simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: aglFt}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
    });
    await settle(unit);
    unit.props.sensors.in.gps.signals.fadeScale = 0;
    unit.props.sensors.in.gps.signals.jitterScale = 0;
    return unit;
}

/** An engine-running unit standing at HOME with a fix, its antenna's attitude from the SimVars (on the ground, level) */
async function bootOnGround(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        storage: STORED_HOME, antennaAttitude: true,
        simVars: [{name: 'SIM ON GROUND', unit: 'bool', value: true}, {name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 0}],
    });
    await settle(unit);
    return unit;
}

interface Step {
    /** Calculation ticks of the flight since the jammer was switched on, a hold not counted */
    s: number;
    nm: number;
    /** The jammer's noise rise at the aircraft */
    riseDb: number;
    lost: number[];
    valid: boolean;
    raim: Raim;
    messages: string[];
}

/**
 * The jet: FL350, a jammer whose power takes the weakest satellite at 150 NM in line of sight, 220 NM ahead on a south-easterly
 * track, which lowers the low PRN 14 in the north-west a little more as the aircraft closes in. The aircraft homes on the site
 * one position per calculation tick: 1 NM a tick down to 45 NM (to keep the run short), then 450 kt, so that the losses of
 * the strong satellites, which come close together, are seen in real time. Ends over the jammer (0.6 NM): at FL350 the
 * antenna's roll-off toward the nadir keeps the strong satellites until the last 10 NM or so (final review, 2026-11-08)
 */
const JET_FT = 35_000;
const JET_TRACK = 150;
const JET_FIRST_LOSS_NM = 150;

async function jetFlight(unit: HeadlessUnit, inView: number[], hold?: (step: Step) => Promise<void>): Promise<Step[]> {
    const gps = unit.props.sensors.in.gps;
    const site = jammer(HOME, JET_TRACK, 220, JET_FIRST_LOSS_NM);
    startJamming(unit, site);
    const steps: Step[] = [];
    let pos = HOME;
    let held = false;
    for (let s = 1; distanceNm(pos, site) > 0.6; s++) {
        const kt = distanceNm(pos, site) > 45 ? 3600 : 450;
        pos = await flyStraight(unit, pos, courseDeg(pos, site), kt, 1, JET_FT);
        const step: Step = {
            s, nm: distanceNm(pos, site), riseDb: noiseRiseDb(gps.transmitters.jammerRatio, 0), lost: inView.filter(prn => gps.signals.isLost(prn)), valid: gps.isValid(),
            raim: raimStatus(gps.solution, halForMode(unit.props.memory.navPage.navmode)), messages: messages(unit),
        };
        steps.push(step);
        if (hold !== undefined && !held && step.lost.length > 0) {
            held = true;
            await hold(step);
        }
    }
    return steps;
}

describe('jamming by distance (#465)', () => {
    it('a jammer ahead at 200 NM: nothing at first, then the weakest satellites go first as the aircraft closes in', async () => {
        const unit = await unitInFlight(JET_FT);
        const gps = unit.props.sensors.in.gps;
        const inView = inUse(unit);
        expect(inView.length).toBe(8); // Precondition: eight satellites in use, none lost
        const snrAtStart = new Map(inView.map(prn => [prn, gps.signals.snr(prn)]));
        const weakest = [...inView].sort((a, b) => snrAtStart.get(a)! - snrAtStart.get(b)!)[0];

        // At the first loss the aircraft holds its place for two minutes: the loss follows the distance, not a timer
        let lostWhileHeld: number[][] = [];
        const steps = await jetFlight(unit, inView, async step => {
            const here = {lat: unit.env.sim.get('PLANE LATITUDE', 'degrees'), lon: unit.env.sim.get('PLANE LONGITUDE', 'degrees')};
            for (let s = 0; s < 120; s++) {
                await flyStraight(unit, here, 0, 0, 1, JET_FT);
                lostWhileHeld.push(inView.filter(prn => gps.signals.isLost(prn)));
            }
            lostWhileHeld = lostWhileHeld.filter(l => l.join() !== step.lost.join());
        });

        expect(steps[0].nm).toBeGreaterThan(218); // Precondition: the first step is about 220 NM out
        expect(steps[0].lost).toEqual([]);
        const first = steps.find(st => st.lost.length > 0)!;
        expect(first.lost).toEqual([weakest]);
        expect(lostWhileHeld).toEqual([]);

        // Final review (2026-11-08): the rise at every step is the one computed here from the jammer's power over the slant
        // range with the test harness's gain at the jammer's depression. It grows slowly from about 35 NM to 10 NM, where the
        // roll-off below the antenna's plane eats most of what the shorter distance gives: the weak satellites go far out,
        // the strong ones only near the jammer
        const powerDb = jammer(HOME, JET_TRACK, 220, JET_FIRST_LOSS_NM).powerDb;
        const handRiseDb = (nm: number) => {
            const slantNm = Math.hypot(nm, (JET_FT - 100) / (1852 / 0.3048));
            return 10 * Math.log10(1 + Math.pow(10, (powerDb - 20 * Math.log10(slantNm) + levelGainDb(nm, JET_FT)) / 10));
        };
        const offRise = steps.filter(st => Math.abs(st.riseDb - handRiseDb(st.nm)) > 0.05);
        expect(offRise.map(st => `${st.nm.toFixed(2)} NM: ${st.riseDb.toFixed(2)} dB, by hand ${handRiseDb(st.nm).toFixed(2)}`)).toEqual([]);
        // The weakest and the strongest are lost where the hand rise first reaches their SNR before the jammer less 30 (the
        // lock rule), within 2 dB of SNR either way for the satellites' motion over the flight (a low one sinks by a few
        // degrees as the aircraft flies away from it). Coming in from 220 NM, within the 242 NM horizon of FL350
        const reachedAtNm = (riseDb: number) => {
            let nm = 220;
            while (nm > 0.6 && handRiseDb(nm) < riseDb) {
                nm -= 0.01;
            }
            return nm;
        };
        const strongest = [...inView].sort((a, b) => snrAtStart.get(b)! - snrAtStart.get(a)!)[0];
        const last = steps.find(st => st.lost.includes(strongest))!;
        const weakestSnr = snrAtStart.get(weakest)!;
        const strongestSnr = snrAtStart.get(strongest)!;
        expect(first.nm).toBeGreaterThan(reachedAtNm(weakestSnr - 28) - 1); // One step of 1 NM
        expect(first.nm).toBeLessThan(reachedAtNm(weakestSnr - 32) + 1);
        expect(last.nm).toBeGreaterThan(reachedAtNm(strongestSnr - 28) - 0.2); // One step of 0.125 NM
        expect(last.nm).toBeLessThan(reachedAtNm(strongestSnr - 32) + 0.2);
        // The hand values: the weakest (SNR 39) beyond 75 NM even with 2 dB to spare, the strongest (51) within 10 NM
        expect(reachedAtNm(weakestSnr - 28)).toBeGreaterThan(75);
        expect(reachedAtNm(strongestSnr - 32)).toBeLessThan(10);

        // The loss order is the order of the SNRs before the jammer, which one rise for every satellite keeps. Satellites
        // lost in the same step count in the order of those SNRs
        const bySnrAtStart = (a: number, b: number) => snrAtStart.get(a)! - snrAtStart.get(b)!;
        const lostAt = (prn: number) => steps.findIndex(st => st.lost.includes(prn));
        const lossOrder = [...inView].sort((a, b) => lostAt(a) - lostAt(b) || bySnrAtStart(a, b));
        expect(inView.filter(prn => lostAt(prn) < 0)).toEqual([]); // Precondition: every one of them is lost
        expect(lossOrder).toEqual([...inView].sort(bySnrAtStart));
        expect(unit.errors).toEqual([]);
    }, 120_000);

    it('RAIM NOT AVAILABLE emerges before the fix goes', async () => {
        const unit = await unitInFlight(JET_FT);
        const inView = inUse(unit);
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([]); // Precondition

        const steps = await jetFlight(unit, inView);

        const raimLost = steps.findIndex(st => st.valid && st.raim !== Raim.Available);
        const fixLost = steps.findIndex(st => !st.valid);
        expect(raimLost).toBeGreaterThanOrEqual(0);
        expect(fixLost).toBeGreaterThan(raimLost);
        expect(steps[fixLost].s - steps[raimLost].s).toBeGreaterThan(10);
        const raimMessage = steps.findIndex(st => st.messages.includes(RAIM_MESSAGE));
        const coverage = steps.findIndex(st => st.messages.includes(COVERAGE));
        expect(raimMessage).toBeGreaterThanOrEqual(0);
        expect(coverage).toBeGreaterThan(raimMessage);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Maintainer, final review (2026-11-08): the draws reach 600 NM, beyond the radio horizon of FL350 (1.23 × (sqrt(100) +
    // sqrt(35,000)) = 242.4 NM), so that some jammers black out a wide area. The jammer of the strongest draw 250 NM ahead,
    // just inside its edge: the jet homes on it 1 NM a calculation tick. Crossing into line of sight the rise climbs 2 dB a
    // NM out of the diffraction band, so the first satellite goes at the horizon. The rise is the one computed here by
    // hand; the strongest satellite goes where it first reaches that satellite's SNR less 30, over 100 NM out, where the
    // jet flight of a 150 NM jammer keeps it to within 10 NM
    it('a jammer of the strongest draw takes the first satellite at the horizon and every one over 100 NM out', async () => {
        const unit = await unitInFlight(JET_FT);
        const gps = unit.props.sensors.in.gps;
        const inView = inUse(unit);
        expect(inView.length).toBe(8); // Precondition
        const snrAtStart = new Map(inView.map(prn => [prn, gps.signals.snr(prn)]));
        const strongest = [...inView].sort((a, b) => snrAtStart.get(b)! - snrAtStart.get(a)!)[0];
        const weakest = [...inView].sort((a, b) => snrAtStart.get(a)! - snrAtStart.get(b)!)[0];
        const site = jammer(HOME, JET_TRACK, 250, 600);
        startJamming(unit, site);

        const steps: { nm: number, lost: number[], valid: boolean }[] = [];
        let pos = HOME;
        while (distanceNm(pos, site) > 90 && (steps.length === 0 || steps[steps.length - 1].lost.length < inView.length)) {
            pos = await flyStraight(unit, pos, courseDeg(pos, site), 3600, 1, JET_FT);
            steps.push({nm: distanceNm(pos, site), lost: inView.filter(prn => gps.signals.isLost(prn)), valid: gps.isValid()});
        }

        expect(gps.transmitters.jammer).toMatchObject({lat: site.lat, lon: site.lon, powerDb: site.powerDb}); // Precondition: the same jammer all the way, not replaced
        expect(steps[0].lost).toEqual([]);
        // The hand rise: the spreading over the slant range, the test harness's gain, and beyond the horizon 2 dB a NM
        const handRiseDb = (nm: number) => {
            const slantNm = Math.hypot(nm, (JET_FT - 100) / (1852 / 0.3048));
            const levelDb = site.powerDb - 20 * Math.log10(slantNm) + levelGainDb(nm, JET_FT) - 2 * Math.max(0, nm - 242.4);
            return 10 * Math.log10(1 + Math.pow(10, levelDb / 10));
        };
        const reachedAtNm = (riseDb: number) => {
            let nm = 250;
            while (nm > 0.6 && handRiseDb(nm) < riseDb) {
                nm -= 0.01;
            }
            return nm;
        };
        // The weakest is lost where the hand rise first reaches its SNR less 30, within 2 dB either way (the jet flight
        // above): a few NM beyond the horizon, in the diffraction band
        const first = steps.find(st => st.lost.length > 0);
        expect(first).toBeDefined();
        expect(first!.lost).toEqual([weakest]);
        expect(first!.nm).toBeGreaterThan(reachedAtNm(snrAtStart.get(weakest)! - 28) - 1); // One step of 1 NM
        expect(first!.nm).toBeLessThan(reachedAtNm(snrAtStart.get(weakest)! - 32) + 1);
        expect(reachedAtNm(snrAtStart.get(weakest)! - 28)).toBeGreaterThan(242.4);
        // The strongest, high in the sky, hardly changes its SNR over the two minutes of the flight: within 0.5 dB of the
        // hand distance, about 6 NM here, where 1.5 dB would be 20 NM
        const strongestSnr = snrAtStart.get(strongest)!;
        const last = steps.find(st => st.lost.includes(strongest));
        expect(last).toBeDefined();
        expect(last!.lost).toEqual(inView);
        expect(last!.nm).toBeGreaterThan(reachedAtNm(strongestSnr - 29.5) - 1); // One step of 1 NM
        expect(last!.nm).toBeLessThan(reachedAtNm(strongestSnr - 30.5) + 1);
        expect(reachedAtNm(strongestSnr - 30.5)).toBeGreaterThan(100); // The hand value: the strongest (51) over 100 NM out
        expect(steps.find(st => !st.valid)?.nm).toBeGreaterThan(last!.nm);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // The horizon at 5,000 ft is 99 NM, at 500 ft 40 NM (GpsTransmitter radioHorizonNm). A strong jammer 55 NM away takes every
    // satellite at 5,000 ft; at 500 ft it is 15 NM beyond the horizon, and the diffraction loss leaves the satellites
    it("a descent below the jammer's horizon brings the satellites back", async () => {
        const unit = await unitInFlight(5000);
        const gps = unit.props.sensors.in.gps;
        const track = 60;
        const site = jammer(HOME, track - 90, 55, 400); // Abeam on the left: the distance hardly changes
        startJamming(unit, site);
        let pos = await flyStraight(unit, HOME, track, 150, 20, 5000);
        expect(gps.isValid()).toBe(false); // Precondition: jammed at 5,000 ft
        expect(gps.transmitters.jammer).not.toBeNull();
        const jammed = {...gps.transmitters.jammer!};

        let s = 0;
        for (; s < 120 && !gps.isValid(); s++) {
            pos = await flyStraight(unit, pos, track, 150, 1, 500);
        }

        expect(s).toBeLessThan(120);
        expect(gps.transmitters.jammer).toEqual(jammed);
        expect(distanceNm(pos, site)).toBeGreaterThan(50); // Precondition: still beyond the horizon at 500 ft
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Final review (2026-11-08): the antenna's gain toward the jammer, from the test harness. At 5,000 ft the jammer 90 NM
    // abeam on the right is 1.08 degrees under the antenna's plane in level flight, -12.54 dB; banked 20 degrees toward it,
    // 18.9 degrees above, -5.87 dB: the level rises by 6.7 dB. Banked 20 degrees away, 21.1 degrees under, -22.54 dB: it falls
    // by 10 dB. The jammer's power puts its rise in level flight 0.5 dB under what lets the weakest satellite be acquired
    // (35), so that one lost while banked comes back in level flight. Which
    // satellites are lost at each attitude is computed here from their SNRs at that attitude without the jammer and the
    // jammer's rise there: a tracked satellite is lost below 30 (the lock rule). The bank tilts the satellites too, so the
    // attitudes are measured without the jammer first, and each banked attitude is taken from level flight, in which nothing
    // is lost
    it('banking toward the jammer loses satellites that level flight keeps; banking away helps', async () => {
        const unit = await unitInFlight(5000, {antennaAttitude: true});
        const gps = unit.props.sensors.in.gps;
        const sim = unit.env.sim;
        const track = 0;
        sim.set('PLANE HEADING DEGREES TRUE', 'degrees', track);
        sim.set('PLANE PITCH DEGREES', 'degrees', 0);
        sim.set('PLANE BANK DEGREES', 'degrees', 0);
        await vi.advanceTimersByTimeAsync(2000);
        const inView = inUse(unit);
        // One calculation tick each: the transmitters take the attitude of the tick they run in
        const at = async (bankRightDeg: number) => {
            sim.set('PLANE BANK DEGREES', 'degrees', -bankRightDeg); // MSFS: positive is the left wing down
            await untilCalcTick(unit);
            return {lost: inView.filter(prn => gps.signals.isLost(prn)), snrs: new Map(inView.map(prn => [prn, gps.signals.snr(prn)])), ratio: gps.transmitters.jammerRatio};
        };
        await flyStraight(unit, HOME, track, 0, 2, 5000);
        const clean = {level: await at(0), toward: await at(20), level2: await at(0), away: await at(-20), level3: await at(0)};
        expect(clean.level3.lost).toEqual([]); // Precondition: level flight loses nothing without the jammer

        const gainLevel = gainAtElevationDb(abeamElevationDeg(90, 5000, 0));
        const gainToward = gainAtElevationDb(abeamElevationDeg(90, 5000, 20));
        const gainAway = gainAtElevationDb(abeamElevationDeg(90, 5000, -20));
        expect(gainToward - gainLevel).toBeCloseTo(6.67, 1); // The hand values: the ruling's 6 to 8 dB toward
        expect(gainAway - gainLevel).toBeCloseTo(-10.0, 1);
        const minLevelSnr = Math.min(...clean.level.snrs.values());
        const levelRiseDb = minLevelSnr - 35 - 0.5;
        const levelDbAt = (gainDb: number) => 10 * Math.log10(Math.pow(10, levelRiseDb / 10) - 1) - gainLevel + gainDb;
        const riseAt = (gainDb: number) => 10 * Math.log10(1 + Math.pow(10, levelDbAt(gainDb) / 10));
        const site = pointFrom(HOME, track + 90, 90); // Within the 99 NM horizon
        startJamming(unit, {lat: site.lat, lon: site.lon, powerDb: powerForLevelDb(levelDbAt(gainLevel), 90, 5000), refAglFt: 10_000});

        const level = await at(0);
        const toward = await at(20);
        await at(0);
        await at(0);
        const away = await at(-20);
        const expectedLost = (snrs: Map<number, number>, gainDb: number) => inView.filter(prn => snrs.get(prn)! - riseAt(gainDb) < 30);

        expect(gps.transmitters.jammer).not.toBeNull(); // Precondition
        expect(10 * Math.log10(toward.ratio / level.ratio)).toBeCloseTo(gainToward - gainLevel, 1);
        expect(10 * Math.log10(away.ratio / level.ratio)).toBeCloseTo(gainAway - gainLevel, 1);
        expect(level.lost).toEqual([]);
        expect(toward.lost).toEqual(expectedLost(clean.toward.snrs, gainToward));
        expect(away.lost).toEqual(expectedLost(clean.away.snrs, gainAway));
        // Toward: a satellite or a few more than the bank alone loses; away: no more than the bank alone
        expect(toward.lost.length).toBeGreaterThan(clean.toward.lost.length);
        expect(toward.lost.length - clean.toward.lost.length).toBeLessThanOrEqual(3);
        expect(away.lost).toEqual(clean.away.lost);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Placement in flight (design, "Placement"; controller ruling H): ahead on the track within 30 degrees, where the rise at the
    // present height in level flight is 1 to 3 dB, so that nothing shows yet
    // On four tracks, so that a random bearing cannot pass by chance. Before each, the aircraft flies longer than
    // MAX_SIGNAL_STEP_S with no failure: the track at the switch-on must come from the ticks without one
    it('switched on in flight, the jammer is placed ahead on the track, just inside its edge, and takes nothing yet', async () => {
        const unit = await unitInFlight(10_000);
        const gps = unit.props.sensors.in.gps;
        const inView = inUse(unit);
        const placements: { track: number, offTrackDeg: number, riseDb: number, lost: number[], ratio: number }[] = [];
        let pos = HOME;
        for (const track of [150, 240, 330, 200]) {
            pos = await flyStraight(unit, pos, track, 300, MAX_SIGNAL_STEP_S + 5, 10_000);
            unit.props.failures.fail('gpsJamming');
            const placedFrom = await flyStraight(unit, pos, track, 300, 1, 10_000); // The calculation tick that places it
            const site = {...gps.transmitters.jammer!};
            pos = await flyStraight(unit, placedFrom, track, 300, 5, 10_000);
            const off = Math.abs(courseDeg(placedFrom, site) - track);
            placements.push({
                track, offTrackDeg: Math.min(off, 360 - off),
                riseDb: noiseRiseDb(dbToRatio(levelDb(site.powerDb, distanceNm(placedFrom, site), 10_000, levelGainDb(distanceNm(placedFrom, site), 10_000))), 0),
                lost: inView.filter(prn => gps.signals.isLost(prn)), ratio: gps.transmitters.jammerRatio,
            });
            unit.props.failures.repair('gpsJamming');
        }

        expect(placements.filter(p => p.offTrackDeg > 30.5).map(p => `track ${p.track}: ${p.offTrackDeg.toFixed(1)} degrees off`)).toEqual([]);
        for (const p of placements) {
            expect(p.riseDb, `track ${p.track}`).toBeGreaterThan(1 - 0.01);
            expect(p.riseDb, `track ${p.track}`).toBeLessThan(3 + 0.01);
            expect(p.lost, `track ${p.track}`).toEqual([]);
            expect(p.ratio, `track ${p.track}`).toBeGreaterThan(0);
        }
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Placement on the ground: within the ground horizon and 15 NM, so the jammer takes effect at once
    it('on the ground the jammer is close and takes the satellites within seconds', async () => {
        const unit = await bootOnGround();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(true); // Precondition

        unit.props.failures.fail('gpsJamming');
        await untilCalcTick(unit); // The transmitters run before the signals: the first calculation tick loses the fix
        const valid = [gps.isValid()];
        for (let s = 0; s < 10; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            valid.push(gps.isValid());
        }
        await afterCalcTick(unit);

        expect(distanceNm(HOME, gps.transmitters.jammer!)).toBeLessThan(15);
        expect(valid).toEqual(new Array(11).fill(false));
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        const rows = await satelliteRows(unit);
        expect(rows.map(prnOf)).toEqual(inChannels(unit));
        expect(rows).toEqual(rows.map(r => searchedRow(unit, prnOf(r))));
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The forced acquisition of an engine-running start runs before the first calculation tick: the stored jammer 5 NM away
    // loses the satellites in it, so nothing is acquired. #469: a lost satellite keeps the channel the forced acquisition
    // gave it and is searched there, as after any other loss; none is Unreachable, and STA 1 shows every channel searched
    it("an engine-running start inside a stored jammer's effect acquires nothing", async () => {
        const site = jammer(HOME, 200, 5, 150);
        const atForced: number[][] = [];
        const atForcedUnreachable: number[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            const sats = this.gpsSatComputer.getSatellites();
            atForced.push(sats.filter(s => TRACKED.has(s.state.get())).map(s => s.prn));
            atForcedUnreachable.push(sats.filter(s => s.state.get() === GPSSatelliteState.Unreachable).map(s => s.prn));
            original.call(this);
        });
        const unit = await bootUnit({storage: {...STORED_HOME, ...jammerAt(site)}});
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;

        expect(atForced).toEqual([[]]); // Exactly one forced acquisition, and it acquired nothing
        expect(atForcedUnreachable).toEqual([[]]); // A lost satellite is searched, never Unreachable (#469)
        expect(gps.hadFixSincePowerOn).toBe(false);

        await afterCalcTick(unit);
        expect(inChannels(unit).length).toBeGreaterThanOrEqual(4); // Precondition: the forced acquisition gave the channels
        const rows = await satelliteRows(unit);
        expect(rows.map(prnOf)).toEqual(inChannels(unit));
        expect(rows).toEqual(rows.map(r => searchedRow(unit, prnOf(r))));
        await vi.advanceTimersByTimeAsync(10_000);
        await afterCalcTick(unit);

        expect(gps.transmitters.jammer).toEqual(site); // The stored jammer, not a new one
        expect(gps.hadFixSincePowerOn).toBe(false);
        expect(gps.isValid()).toBe(false);
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([]);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // #469: the satellites the forced acquisition could not acquire stay searched in their channels, so the fix returns as
    // after a satellite lost in flight: IDLE_ACQUISITION plus TRAN (the sibling above holds the setup). When the forced path
    // marked them Unreachable, the SDK kept them out of the channel assignment and the fix came back after about 242 s
    it('an engine-running start inside a total signal loss reacquires like a satellite lost in flight', async () => {
        const site = jammer(HOME, 200, 5, 150);
        const unit = await bootUnit({storage: {...STORED_HOME, ...jammerAt(site)}});
        const gps = unit.props.sensors.in.gps;
        await afterCalcTick(unit);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(gps.isValid()).toBe(false); // Precondition: the jammer holds every satellite

        unit.props.failures.repair('gpsJamming');
        await untilCalcTick(unit);
        expect(gps.transmitters.jammer).toBeNull();

        // The acquisition time with half its range of spread, one calculation tick of TRAN, and a margin of 15 s
        const boundS = (IDLE_ACQUISITION + WARM_ACQUISITION_RANGE / 2) / 1000 + 1 + 15;
        expect(boundS).toBeLessThan(120);
        expect(await secondsToFix(unit, 300)).toBeLessThan(boundS);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // A minute of jamming on the ground: the lost satellites are still searched in their channels when the jammer goes
    it('the repair: the rise 0, no satellite lost, a fix again within 120 s', async () => {
        const unit = await bootOnGround();
        const gps = unit.props.sensors.in.gps;
        unit.props.failures.fail('gpsJamming');
        await vi.advanceTimersByTimeAsync(60_000);
        expect(gps.isValid()).toBe(false); // Preconditions: jammed, every satellite above the mask lost
        expect(gps.transmitters.jammerRatio).toBeGreaterThan(0);
        expect(visible(unit).length).toBeGreaterThanOrEqual(8);
        expect(visible(unit).filter(prn => !gps.signals.isLost(prn))).toEqual([]);

        unit.props.failures.repair('gpsJamming');
        await untilCalcTick(unit);

        expect(gps.transmitters.jammer).toBeNull();
        expect(gps.transmitters.jammerRatio).toBe(0);
        expect(visible(unit).filter(prn => gps.signals.isLost(prn))).toEqual([]);
        expect(await secondsToFix(unit, 120)).toBeLessThan(120);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Review focus 4 of the plan: Coherent.call with nothing attached never replies. The spoofer waits for its airport, sends
    // nothing meanwhile, and the jammer is not held up by it. Final review (2026-11-08): after 30 s of sim time the search is
    // given up, the drawn point is taken at the ground elevation of the generation (here 0: the fixtures' ground), and an
    // answer that comes later is ignored
    it('an airport search that does not answer leaves the spoofer pending for 30 s, then takes the drawn point; jamming works on', async () => {
        let answer: ((a: { lat: number, lon: number, elevationFt: number } | null) => void) | undefined = undefined;
        const find = vi.spyOn(NearestAirportFinder.prototype, 'find').mockReturnValue(new Promise(resolve => answer = resolve));
        const unit = await bootUnit({storage: {...STORED_HOME, ...jammerAt(jammer(HOME, 200, 5, 150)), failure_gpsSpoofing: '{}'}});
        const gps = unit.props.sensors.in.gps;
        await untilCalcTick(unit);
        expect(find).toHaveBeenCalledTimes(1); // Precondition: the spoofer was drawn and its search started
        const [drawnLat, drawnLon] = find.mock.calls[0];

        await vi.advanceTimersByTimeAsync(28_000);
        expect(gps.transmitters.spoofer).toBeNull();
        expect(gps.transmitters.spooferRatio).toBe(0);
        expect(gps.transmitters.jammerRatio).toBeGreaterThan(0);
        expect(gps.isValid()).toBe(false);

        await vi.advanceTimersByTimeAsync(5_000);
        const site = {...gps.transmitters.spoofer!};
        expect(site.falseLat).toBe(drawnLat);
        expect(site.falseLon).toBe(drawnLon);
        expect(site.falseAltFt).toBe(0);
        expect(gps.transmitters.spooferRatio).toBeGreaterThan(0);

        answer!({lat: 46, lon: 7, elevationFt: 1000});
        await vi.advanceTimersByTimeAsync(2_000);
        expect(gps.transmitters.spoofer).toEqual(site);
        expect(find).toHaveBeenCalledTimes(1);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "Recovery": with no fix for the start model's give-up time (Install manual 2-66: 5 minutes) the receiver gives
    // up on the satellites it predicts and searches the sky (3-17), STA 1 INIT as after a power-on, and searches every PRN
    // again (KLNGPSSatComputer.forgetUnreachable). Without it the SDK marks every lost satellite Unreachable after its
    // acquisition timeout (4 minutes) and leaves it out for an hour, so that the fix would not come back here at all. The
    // jammer 10 NM ahead takes every satellite at 10,000 ft; the aircraft holds 6 minutes, then flies away 1 NM a tick beyond
    // the jammer's edge and holds there. Final review (2026-11-08): the sky search keeps the receiver's belief, whose clock
    // and position a jammer leaves right (Felux et al., NAVIGATION 71(3), 2024: an A321 back about 2 minutes after the
    // interference ended). The fix comes back as a reacquisition would after four satellites are back: IDLE_ACQUISITION,
    // 40 s with a range of 6 s, then up to two calculation ticks of TRAN, and 3 s of margin: 34 to 48 s. A blind search would
    // take 60 s or more (BLIND_ACQUISITION 90 s, a range of 60 s), and the channels the SDK filled with satellites below the
    // horizon while every satellite was lost would hold the fix off for up to its 4 minute timeout
    it('a total loss to a jammer for over 5 minutes: STA 1 shows INIT; after leaving the jammer the fix comes back with the idle acquisition time', async () => {
        const unit = await unitInFlight(10_000);
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        const track = 90;
        const site = jammer(HOME, track, 10, 100);
        startJamming(unit, site);

        let pos = await flyStraight(unit, HOME, track, 0, 10, 10_000);
        expect(gps.isValid()).toBe(false); // Precondition: every satellite lost
        expect(visible(unit).filter(prn => !gps.signals.isLost(prn))).toEqual([]);
        pos = await flyStraight(unit, pos, track, 0, 280, 10_000);
        await afterCalcTick(unit);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ'); // Under 5 minutes: the lost satellites are searched
        pos = await flyStraight(unit, pos, track, 0, 70, 10_000);
        await afterCalcTick(unit);
        expect(gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');

        const edge = jammerEdgeNm(site.powerDb, 10_000);
        let fourBack: number | undefined = undefined;
        let fixAt: number | undefined = undefined;
        for (let s = 1; s <= 900 && fixAt === undefined; s++) {
            const kt = distanceNm(pos, site) > edge + 1 ? 0 : 3600;
            pos = await flyStraight(unit, pos, track + 180, kt, 1, 10_000);
            if (fourBack === undefined && visible(unit).filter(prn => !gps.signals.isLost(prn)).length >= 4) {
                fourBack = s;
            }
            if (gps.isValid()) {
                fixAt = s;
            }
        }

        expect(fourBack).toBeDefined();
        expect(fixAt).toBeDefined();
        expect(fixAt! - fourBack!).toBeGreaterThanOrEqual(34);
        expect(fixAt! - fourBack!).toBeLessThanOrEqual(48);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // The STA 1 snapshot of GpsAcquisition.test.ts, from the same boot
    it('with failures off, nothing changes', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;

        expect(gps.transmitters.jammer).toBeNull();
        expect(gps.transmitters.spoofer).toBeNull();
        expect(gps.transmitters.jammerRatio).toBe(0);
        expect(gps.transmitters.spooferRatio).toBe(0);
        expect(await satelliteRows(unit)).toEqual([
            ' 01  47 25°', ' 08  51 76°', ' 10  49 48°', ' 14  39 10°', ' 16  40 10°', ' 21  48 55°', ' 23  43 18°', ' 27  50 57°',
        ]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Final review (2026-11-08), the tick cost rule of CLAUDE.md: the heights above the ground are read only for a transmitter.
    // With failures off a calculation tick of the GPS reads what it read before #465 (base a6f6d79a): the sim time and the
    // position, and the ground speed of the measurement strategy, once each; the preparation of a forced acquisition reads
    // nothing. With a jammer, the two heights once each in addition
    it('with failures off the GPS reads no height; with a jammer once each per tick', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const read = vi.spyOn(SimVar, 'GetSimVarValue');
        const names = () => read.mock.calls.map(c => c[0] as string);

        gps.tick();
        expect(names()).toEqual(['E:ABSOLUTE TIME', 'PLANE LATITUDE', 'PLANE LONGITUDE', 'GROUND VELOCITY']);
        read.mockClear();
        gps.gpsSatComputer.onBeforeForcedAcquisition!();
        expect(names()).toEqual([]);

        unit.props.failures.fail('gpsJamming');
        read.mockClear();
        gps.tick();
        expect(names().filter(n => n === 'PLANE ALT ABOVE GROUND')).toHaveLength(1);
        expect(names().filter(n => n === 'PLANE ALTITUDE')).toHaveLength(1);
        read.mockClear();
        gps.gpsSatComputer.onBeforeForcedAcquisition!();
        expect(names()).toEqual(['E:ABSOLUTE TIME', 'PLANE LATITUDE', 'PLANE LONGITUDE', 'PLANE ALT ABOVE GROUND', 'PLANE ALTITUDE']);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Take-home mode has no receiver failures (#460) and no transmitters: a stored jammer 5 NM away is not loaded, not even by
    // the forced acquisition of the engine-running start, and takes no satellite
    it('take-home mode: a stored jammer close by has no site, no rise and takes nothing', async () => {
        const unit = await bootUnit({panelXml: panelXml({TakeHomeMode: true}), storage: {...STORED_HOME, ...jammerAt(jammer(HOME, 200, 5, 150))}});
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.props.failures.isActive('gpsJamming')).toBe(true); // Precondition: the failure is stored
        expect(gps.transmitters.jammer).toBeNull();
        expect(gps.transmitters.jammerRatio).toBe(0);
        expect(inChannels(unit).length).toBe(8);
        expect(inChannels(unit).filter(prn => gps.signals.isLost(prn))).toEqual([]);
        expect(gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

// The spoofer's own effects come with the fake receiver; these hold what the receiver gives it and takes from it now
describe('the spoofer in the receiver (#465)', () => {
    // Design, "The noise floor and the real satellites": the fake signals add to the noise as the jammer does. A spoofer whose
    // power would capture at 300 NM in line of sight is about 55 dB over the noise at 5 NM
    it('a stored spoofer close by raises the noise floor of the real satellites, as a jammer does', async () => {
        const p = pointFrom(HOME, 200, 5);
        const falsePosition = pointFrom(HOME, 20, 60);
        const unit = await bootUnit({
            storage: {
                ...STORED_HOME, ...spooferAt({
                    lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: 10_000,
                    falseLat: falsePosition.lat, falseLon: falsePosition.lon, falseAltFt: 0, shiftMs: 0, clockM: 0,
                }),
            },
        });
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(5000);

        expect(gps.transmitters.jammerRatio).toBe(0); // Precondition: the spoofer alone
        expect(gps.transmitters.spoofer).not.toBeNull();
        expect(visible(unit).length).toBeGreaterThanOrEqual(8);
        expect(visible(unit).filter(prn => !gps.signals.isLost(prn))).toEqual([]);
        expect(gps.isValid()).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Without an airport near the drawn false position, the false altitude is the ground elevation under the aircraft at the
    // generation: PLANE ALTITUDE less PLANE ALT ABOVE GROUND, here 8,000 ft less 3,000 ft
    it('a spoofer drawn without an airport nearby takes the ground elevation under the aircraft', async () => {
        vi.spyOn(NearestAirportFinder.prototype, 'find').mockResolvedValue(null);
        const unit = await bootUnit({
            altitudeFt: 8000, storage: STORED_HOME,
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 3000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        await settle(unit);

        unit.props.failures.fail('gpsSpoofing');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.gps.transmitters.spoofer).not.toBeNull(); // Precondition: drawn and resolved
        expect(unit.props.failures.values('gpsSpoofing').falseAltFt).toBe(5000);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "Jamming and spoofing together": the jammer's level lowers the fake satellites as it lowers the real ones. At
    // 10,000 ft, 100 NM from a spoofer that would capture at 300 NM, every real satellite is drowned and the fake ones take
    // the channels at an SNR near 50. A jammer 1 NM to the side, 56 dB over the noise at the aircraft (its power set from
    // that level with the test harness's gain, the floor 58 degrees under the plane), is some 25 dB over the fake signals
    // together: their SNRs fall below 30 and they are lost at once
    it('a jammer close in drowns the fake satellites too', async () => {
        const p = pointFrom(HOME, 200, 100);
        const falsePosition = pointFrom(p, 20, 60);
        const unit = await bootUnit({
            altitudeFt: 10_000,
            storage: {
                ...STORED_HOME, ...spooferAt({
                    lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: 10_000,
                    falseLat: falsePosition.lat, falseLon: falsePosition.lon, falseAltFt: 0, shiftMs: 0, clockM: 0,
                }),
            },
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 10_000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(5000);
        const claimed = gps.channelRows().filter(r => r.fake).map(r => r.prn);
        expect(claimed.length).toBe(8); // Precondition: the spoofer alone
        expect(claimed.every(prn => gps.fakeReceiver.snr(prn) > 45)).toBe(true);

        const close = pointFrom(HOME, 90, 1);
        startJamming(unit, {lat: close.lat, lon: close.lon, powerDb: powerForLevelDb(56, 1, 10_000), refAglFt: 10_000});
        await vi.advanceTimersByTimeAsync(1000);

        expect(gps.transmitters.jammerRatio).toBeGreaterThan(0); // Precondition: the jammer is there
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        expect(claimed.filter(prn => gps.fakeReceiver.snr(prn) >= 30)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The fake receiver gives the transmitters the fake sky's count, so that a spoofer's edge is computed for the fake
    // satellites it sends (design, "Placement"). Without a spoofer there is no fake sky: the count of the last one stays
    it('a spoofer switched on after a repair is placed for the last fake sky, not for an empty one', async () => {
        vi.spyOn(NearestAirportFinder.prototype, 'find').mockResolvedValue(null);
        const unit = await unitInFlight(10_000);
        const gps = unit.props.sensors.in.gps;
        unit.props.failures.fail('gpsSpoofing');
        let pos = await flyStraight(unit, HOME, 90, 300, 5, 10_000);
        const count = gps.fakeReceiver.fakeSkyCount;
        expect(count).toBeGreaterThan(0); // Precondition: the first spoofer's fake sky
        expect(gps.transmitters.spooferFakeCount).toBe(count);

        unit.props.failures.repair('gpsSpoofing');
        pos = await flyStraight(unit, pos, 90, 300, 5, 10_000);
        expect(gps.fakeReceiver.fakeSkyCount).toBe(0); // Precondition: no fake sky without a spoofer
        expect(gps.transmitters.spooferFakeCount).toBe(count);
        unit.props.failures.fail('gpsSpoofing');
        const placedFrom = await flyStraight(unit, pos, 90, 300, 1, 10_000);
        await vi.advanceTimersByTimeAsync(0);
        const site = {...gps.transmitters.spoofer!};

        // Placed where the fake SNR for the last fake sky's count is 35 to 38 (controller ruling H)
        const placedNm = distanceNm(placedFrom, site);
        const snr = fakeSnr(dbToRatio(levelDb(site.powerDb, placedNm, 10_000, levelGainDb(placedNm, 10_000))) / count, count, 0);
        expect(snr).toBeGreaterThan(35 - 0.01);
        expect(snr).toBeLessThan(38 + 0.01);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
