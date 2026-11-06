import {afterEach, describe, expect, it, vi} from 'vitest';
import {EventBus, GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {GPS} from '../../kln90b/Gps';
import {ExactMeasurement} from '../../kln90b/GpsMeasurement';
import {AntennaAttitudeSource, LEVEL_ANTENNA} from '../../kln90b/AntennaAttitude';
import {AntennaAttitude, SatelliteSignals} from '../../kln90b/GpsSignal';
import {PowerEvent} from '../../kln90b/PowerSupply';
import {MessageHandler} from '../../kln90b/data/MessageHandler';

/**
 * #467: a satellite whose signal the receiver lost acts on the SDK through its reachability (Gps.ts wrapReachability),
 * never through inhibits. The spec docs/superpowers/specs/2026-11-06-satellite-signal-design.md, "How a lost satellite acts
 * on the SDK". These are characterizations of our wiring; the Pilot's Guide says nothing of the SDK
 */

/** The position stored at the last power-off is where the unit boots, so the boot posts no POSITION DIFFERS message */
const HOME = {lastLatitude: 47, lastLongitude: 8};
/** A finished jamming ramp of 26 dB, stored by an earlier session */
const FINISHED_RAMP = {failure_gpsJamming: JSON.stringify({rampS: 240, finalDb: 26, elapsedS: 240})};
/** A ramp of 26 dB over 240 s, started at the boot */
const RAMP = {failure_gpsJamming: JSON.stringify({rampS: 240, finalDb: 26, elapsedS: 0})};

const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);
const byNumber = (a: number, b: number) => a - b;

afterEach(() => {
    vi.restoreAllMocks();
});

const satellite = (unit: HeadlessUnit, prn: number): GPSSatellite =>
    unit.props.sensors.in.gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
const channelPrns = (unit: HeadlessUnit) =>
    unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null).map(s => s!.prn).sort(byNumber);
/** The unit's solution in row order (GPS.solutionPrns, read for the test) */
const solutionPrns = (unit: HeadlessUnit): number[] => [...unit.props.sensors.in.gps['solutionPrns']];
const inhibited = (unit: HeadlessUnit) => [...unit.props.sensors.in.gps.gpsSatComputer.inhibitedSatellitePrnCodes.get()];
/** Degrees above the horizon from the SDK's zenith angle, as STA 1 rounds it */
const elevation = (unit: HeadlessUnit, prn: number): number => Math.round(90 - satellite(unit, prn).position.get()[0] * 180 / Math.PI);

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

describe('a lost satellite reaches the SDK through its reachability (#467, characterization)', () => {
    // The SDK's own model of a missing signal: a tracked satellite that is not reachable falls back to None and stays in
    // its channel, searched (GPSSat.ts updateStateTracked). An SDK upgrade that moves the private signal strength fails here
    it('a satellite in use that is lost is None in its channel after one calculation tick, out of the solution, *PP  00 on STA 1, and in use again within 20 s once it is back', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        const target = solutionPrns(unit)[0];
        expect(satellite(unit, target).state.get()).toBe(GPSSatelliteState.InUse); // Precondition

        const isLost = gps.signals.isLost.bind(gps.signals);
        const spy = vi.spyOn(gps.signals, 'isLost').mockImplementation(prn => prn === target || isLost(prn));
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250); // The display tick after it

        expect(satellite(unit, target).state.get()).toBe(GPSSatelliteState.None);
        expect(channelPrns(unit)).toContain(target);
        expect(solutionPrns(unit)).not.toContain(target);
        const ele = String(elevation(unit, target)).padStart(2, '0');
        expect((await satelliteRows(unit)).filter(r => Number(r.slice(1, 3)) === target))
            .toEqual([`*${String(target).padStart(2, '0')}  00 ${ele}°`]);

        spy.mockRestore();
        let back = -1;
        for (let s = 1; s <= 20 && back < 0; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            if (satellite(unit, target).state.get() === GPSSatelliteState.InUse) {
                back = s;
            }
        }
        expect(back).toBeGreaterThan(0);
        expect(solutionPrns(unit)).toContain(target);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The forced acquisition of an engine-running start runs before the first calculation tick: the signals are refreshed
    // from the stored, finished ramp before it, and the forced path makes every lost satellite Unreachable
    it('an engine-running start with a finished jamming ramp stored acquires nothing in the forced acquisition, without an inhibit', async () => {
        const atForced: { tracked: number[], unreachable: number, inhibited: number[] }[] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            const sats = this.gpsSatComputer.getSatellites();
            atForced.push({
                tracked: sats.filter(s => TRACKED.has(s.state.get())).map(s => s.prn),
                unreachable: sats.filter(s => s.state.get() === GPSSatelliteState.Unreachable).length,
                inhibited: [...this.gpsSatComputer.inhibitedSatellitePrnCodes.get()],
            });
            original.call(this);
        });
        const unit = await bootUnit({storage: {...HOME, ...FINISHED_RAMP}});

        expect(atForced.length).toBe(1);
        expect(atForced[0].tracked).toEqual([]);
        expect(atForced[0].unreachable).toBeGreaterThan(0); // Through the reachability
        expect(atForced[0].inhibited).toEqual([]); // Not through inhibits
        expect(unit.props.sensors.in.gps.hadFixSincePowerOn).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Before the first update of a boot the SDK has every satellite overhead (zenith 0); the signals are refreshed inside
    // the forced update, from the positions it computes. A level of 10 dB loses the low satellites and keeps the high ones
    it('the forced acquisition judges the signals from the positions of its own update: under 10 dB the low satellites are lost, the high ones acquired', async () => {
        const atForced: { prn: number, snr: number, zenith: number, state: GPSSatelliteState, inChannel: boolean }[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            const channels = this.gpsSatComputer.getChannels();
            atForced.push(this.gpsSatComputer.getSatellites().map(s => ({
                prn: s.prn, snr: this.signals.snr(s.prn), zenith: s.position.get()[0], state: s.state.get(), inChannel: channels.includes(s),
            })));
            original.call(this);
        });
        await bootUnit({storage: {...HOME, failure_gpsJamming: JSON.stringify({rampS: 100, finalDb: 10, elapsedS: 100})}});

        expect(atForced.length).toBe(1);
        const sats = atForced[0];
        const tracked = sats.filter(s => TRACKED.has(s.state));
        const weakInChannel = sats.filter(s => s.inChannel && s.zenith < 85 * Math.PI / 180 && s.snr < 35);
        expect(tracked.length).toBeGreaterThanOrEqual(4);
        expect(tracked.filter(s => s.snr < 35)).toEqual([]);
        expect(weakInChannel.length).toBeGreaterThan(0);
        expect(weakInChannel.filter(s => s.state !== GPSSatelliteState.Unreachable)).toEqual([]);
    }, 60_000);

    // The control of the case above: without the jamming the same boot acquires in the forced acquisition
    it('the same engine-running start without jamming acquires in the forced acquisition', async () => {
        const atForced: number[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            atForced.push(this.gpsSatComputer.getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn));
            original.call(this);
        });
        const unit = await bootUnit({storage: HOME});

        expect(atForced.length).toBe(1);
        expect(atForced[0].length).toBeGreaterThanOrEqual(4);
        expect(unit.props.sensors.in.gps.hadFixSincePowerOn).toBe(true);
    }, 60_000);

    it('during jamming with satellites lost, no satellite is inhibited', async () => {
        const unit = await bootUnit({storage: {...HOME, ...RAMP}});
        const gps = unit.props.sensors.in.gps;
        const all = gps.gpsSatComputer.getSatellites().map(s => s.prn);
        const lost = () => all.filter(prn => gps.signals.isLost(prn) && channelPrns(unit).includes(prn));
        const inhibitedWhileLost: number[][] = [];
        for (let s = 0; s < 260; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            if (lost().length > 0) {
                inhibitedWhileLost.push(inhibited(unit));
            }
        }

        expect(inhibitedWhileLost.length).toBeGreaterThan(100); // Precondition: lost satellites in the channels for most of the ramp
        expect(inhibitedWhileLost.filter(i => i.length > 0)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The SDK runs no update on a step of its clock back or over twice its update interval (GPSSat.ts onUpdate), so a
    // satellite lost in that tick is still in use in the SDK: the unit's solution leaves it out on its own
    it('a satellite lost in a tick whose SDK update did not run leaves the solution at once, while the SDK still uses it', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const before = solutionPrns(unit);
        const satellites = gps.solution.satellites;
        expect(before.length).toBe(satellites); // Precondition: one row per satellite
        const target = before[0];
        vi.spyOn(gps.gpsSatComputer, 'onUpdate').mockImplementation(() => undefined);
        const isLost = gps.signals.isLost.bind(gps.signals);
        vi.spyOn(gps.signals, 'isLost').mockImplementation(prn => prn === target || isLost(prn));

        await untilCalcTick(unit);

        expect(satellite(unit, target).state.get()).toBe(GPSSatelliteState.InUse); // Precondition
        expect(solutionPrns(unit)).toEqual(before.filter(prn => prn !== target));
        expect(gps.solution.satellites).toBe(satellites - 1);
        expect(gps.isValid()).toBe(true);
    }, 30_000);
});

/** An antenna that can be turned upside down: every satellite is then under its plane, at the back lobe's floor */
class InvertibleAntenna implements AntennaAttitudeSource {
    public inverted = false;

    public read(out: AntennaAttitude): void {
        out.headingTrueDeg = 0;
        out.pitchUpDeg = 0;
        out.bankRightDeg = this.inverted ? 180 : 0;
        out.onGround = false;
    }
}

describe('the antenna and the power cycle in the receiver (#467, characterization)', () => {
    // GPS.tick reads the platform's attitude source before the signals' tick
    it('an antenna turned upside down loses every satellite at the next calculation tick, and the fix', async () => {
        const antenna = new InvertibleAntenna();
        const unit = await bootUnit({storage: HOME, platform: {createAntennaAttitude: () => antenna}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(true); // Precondition

        antenna.inverted = true;
        await untilCalcTick(unit);

        const tracked = gps.gpsSatComputer.getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn);
        expect(tracked).toEqual([]);
        expect(solutionPrns(unit)).toEqual([]);
        await untilCalcTick(unit);
        expect(gps.isValid()).toBe(false);
    }, 30_000);

    // The forced acquisition reads the attitude source too, before the first calculation tick
    it('an engine-running start with the antenna upside down acquires nothing in the forced acquisition', async () => {
        const antenna = new InvertibleAntenna();
        antenna.inverted = true;
        const atForced: number[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            atForced.push(this.gpsSatComputer.getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn));
            original.call(this);
        });
        await bootUnit({storage: HOME, platform: {createAntennaAttitude: () => antenna}});

        expect(atForced).toEqual([[]]);
    }, 30_000);

    // reset() at every power change: the lost set and the SNRs start again (the spec, "What persists")
    it('a power-off clears the lost set and the SNRs', async () => {
        const unit = await bootUnit({storage: {...HOME, ...FINISHED_RAMP}});
        await untilCalcTick(unit);
        const gps = unit.props.sensors.in.gps;
        const all = gps.gpsSatComputer.getSatellites().map(s => s.prn);
        expect(all.filter(prn => gps.signals.isLost(prn)).length).toBeGreaterThan(0); // Precondition
        expect(all.filter(prn => gps.signals.snr(prn) !== 0).length).toBeGreaterThan(0);

        await unit.panel.powerOff();

        expect(all.filter(prn => gps.signals.isLost(prn))).toEqual([]);
        expect(all.filter(prn => gps.signals.snr(prn) !== 0)).toEqual([]);
    }, 30_000);
});

describe('the refresh of the forced acquisition (#467, characterization)', () => {
    // The refresh runs once, inside the forced update; the calculation ticks after it compute the signals in their own
    // tick and refresh nothing (the tick cost rule, CLAUDE.md)
    it('an engine-running boot refreshes the signals once, in the forced acquisition, and not in the calculation ticks after it', async () => {
        const refresh = vi.spyOn(SatelliteSignals.prototype, 'refresh');
        const unit = await bootUnit({storage: HOME});
        expect(unit.props.sensors.in.gps.hadFixSincePowerOn).toBe(true); // Precondition: the forced acquisition ran
        expect(refresh).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5000);

        expect(refresh).toHaveBeenCalledTimes(1);
    }, 30_000);

    // A forced acquisition asked before the satellites are loaded and cancelled before they are (a power-off, which
    // resets the receiver) leaves no refresh pending for the receiver's next update
    it('a power change cancels the refresh of a forced acquisition that never ran', async () => {
        const unit = await bootUnit({storage: HOME});
        const p = unit.props;
        const bus = new EventBus();
        const gps = new GPS(bus, p.userSettings, p.planeSettings, new MessageHandler(), () => null, new ExactMeasurement(),
            LEVEL_ANTENNA, () => 0.5, p.failures);
        expect(gps.gpsSatComputer.getSatellites()).toEqual([]); // Precondition: not loaded yet
        gps.gpsSatComputer.acquireAndUseSatellites();
        gps.gpsSatComputer.reset(); // As GPS.reset at a power-off: the SDK drops the delayed forced acquisition
        bus.getPublisher<PowerEvent>().pub('powerEvent', {isPowered: false, timeSincePowerChange: 0});
        await vi.advanceTimersByTimeAsync(250); // The fake XMLHttpRequest answers on a timer
        await gps.gpsSatComputer.awaitInit();
        const refresh = vi.spyOn(gps.signals, 'refresh');

        gps.gpsSatComputer.onUpdate();

        expect(gps.gpsSatComputer.getSatellites().length).toBeGreaterThan(0); // Precondition: loaded and updated
        expect(refresh).not.toHaveBeenCalled();
        expect(unit.errors).toEqual([]);
    }, 30_000);
});

describe('wrapReachability (#467, characterization)', () => {
    // The wrapper reaches into the SDK's private satellite data; an upgrade that moves it must fail loudly, not silently
    // disable the signal loss
    it.each([
        ['without private data', {}],
        ['whose private data has no signal strength', {data: {state: GPSSatelliteState.None}}],
        ['whose signal strength is not a number', {data: {signalStrength: '0.5'}}],
    ])('throws for a satellite %s', async (_name, fields) => {
        const unit = await bootUnit({storage: HOME});
        const computer = unit.props.sensors.in.gps.gpsSatComputer;
        vi.spyOn(computer, 'getSatellites').mockReturnValue([{prn: 1, ...fields} as unknown as GPSSatellite]);

        expect(() => computer.wrapReachability(() => false)).toThrow('GPSSatellite data moved: recheck Gps.ts after the SDK upgrade');
    }, 30_000);

    it('puts the SDK\'s signal strength back after the call, also for a lost satellite', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const target = solutionPrns(unit)[0];
        const data = (satellite(unit, target) as any).data;
        const strength = data.signalStrength;
        expect(strength).toBeGreaterThan(0.05); // Precondition: reachable by the SDK's geometry

        vi.spyOn(gps.signals, 'isLost').mockImplementation(prn => prn === target);
        await untilCalcTick(unit);

        expect(satellite(unit, target).state.get()).toBe(GPSSatelliteState.None); // Precondition: it was lost
        expect(data.signalStrength).toBeGreaterThan(0.05);
        expect(satellite(unit, target).signalStrength.get()).toBeGreaterThan(0.05);
    }, 30_000);

    // The SDK delays a forced acquisition asked before its satellites are loaded until just before awaitInit resolves
    // (GPSSat.ts doInit), so the wrapper must already be in place for it
    it('a forced acquisition asked before the satellites are loaded runs with the reachability wrapped', async () => {
        const unit = await bootUnit({storage: HOME});
        const p = unit.props;
        const gps = new GPS(new EventBus(), p.userSettings, p.planeSettings, new MessageHandler(), () => null, new ExactMeasurement(),
            LEVEL_ANTENNA, () => 0.5, p.failures);
        vi.spyOn(gps.signals, 'isLost').mockReturnValue(true);
        expect(gps.gpsSatComputer.getSatellites()).toEqual([]); // Precondition: not loaded yet

        gps.gpsSatComputer.acquireAndUseSatellites();
        await vi.advanceTimersByTimeAsync(250); // The fake XMLHttpRequest answers on a timer
        await gps.gpsSatComputer.awaitInit();

        const states = gps.gpsSatComputer.getSatellites().map(s => s.state.get());
        expect(states.length).toBeGreaterThan(0); // Precondition: loaded
        expect(states.filter(s => TRACKED.has(s))).toEqual([]);
        expect(states.filter(s => s === GPSSatelliteState.Unreachable).length).toBeGreaterThan(0);
        expect(unit.errors).toEqual([]);
    }, 30_000);
});
