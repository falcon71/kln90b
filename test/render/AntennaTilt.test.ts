import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../harness/boot';
import {Aircraft} from '../harness/flight/Aircraft';
import {Screen} from '../harness/render/screen';

/**
 * #467: the antenna tilts with the aircraft. The unit reads the attitude from the SimVars only when a test opts in
 * (bootUnit antennaAttitude); the default test platform keeps the antenna level. These are characterizations of our
 * signal model (docs/superpowers/specs/2026-11-06-satellite-signal-design.md); the Pilot's Guide gives no tilt numbers.
 * MSFS signs: a bank to the RIGHT is a NEGATIVE PLANE BANK DEGREES, nose up is a NEGATIVE PLANE PITCH DEGREES. In a bank
 * the antenna faces the inside of the turn, so a low satellite on the high-wing side (the outside of the turn) is lost
 */

/**
 * The position stored at the last power-off, so a REAL boot posts no POSITION DIFFERS message. FAST and REAL share the
 * receiver's timings (#468), so both keep a lost satellite searched, *PP  00
 */
const HOME = {lastLatitude: 47, lastLongitude: 8};

afterEach(() => {
    vi.restoreAllMocks();
});

const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
const satellites = (unit: HeadlessUnit): readonly GPSSatellite[] => gpsOf(unit).gpsSatComputer.getSatellites();
const inUse = (s: GPSSatellite) => s.state.get() === GPSSatelliteState.InUse || s.state.get() === GPSSatelliteState.InUseDiffApplied;

const norm360 = (a: number): number => ((a % 360) + 360) % 360;
/** The true azimuth of a satellite in degrees: the SDK's hour angle turns from north towards the west */
const azimuth = (sat: GPSSatellite): number => norm360(-sat.position.get()[1] * 180 / Math.PI);
const elevationDeg = (sat: GPSSatellite): number => 90 - sat.position.get()[0] * 180 / Math.PI;
/** The azimuth relative to the nose, positive to the right, in -180..180 */
const relative = (sat: GPSSatellite, heading: number): number => ((azimuth(sat) - heading + 540) % 360) - 180;

async function flyingUnit(antennaAttitude = true, storage: Record<string, unknown> = {}): Promise<{ unit: HeadlessUnit, low: GPSSatellite, view: readonly GPSSatellite[] }> {
    const unit = await bootUnit({storage: {...HOME, ...storage}, antennaAttitude});
    await settle(unit);
    const signals = gpsOf(unit).signals;
    signals.fadeScale = 0;
    signals.jitterScale = 0;
    const used = satellites(unit).filter(inUse);
    expect(used.length).toBeGreaterThanOrEqual(6); // Precondition: a full solution
    const low = used.reduce((a, b) => elevationDeg(a) <= elevationDeg(b) ? a : b);
    return {unit, low, view: used};
}

/** Heading, bank and pitch as the sim gives them: MSFS bank positive left wing down, MSFS pitch positive nose down */
function fly(unit: HeadlessUnit, headingTrue: number, msfsBank: number, msfsPitch = 0): void {
    unit.env.sim.set('PLANE HEADING DEGREES TRUE', 'degrees', norm360(headingTrue));
    unit.env.sim.set('PLANE BANK DEGREES', 'degrees', msfsBank);
    unit.env.sim.set('PLANE PITCH DEGREES', 'degrees', msfsPitch);
    unit.env.sim.set('SIM ON GROUND', 'bool', false);
}

async function twoCalcTicks(unit: HeadlessUnit): Promise<void> {
    await untilCalcTick(unit);
    await untilCalcTick(unit);
    await vi.advanceTimersByTimeAsync(250); // The display tick after them
}

/** The satellites of the view (in use at the start) that are lost; the ones below the horizon are lost from the start and say nothing */
const lostOf = (unit: HeadlessUnit, view: readonly GPSSatellite[]): number[] => view.filter(s => gpsOf(unit).signals.isLost(s.prn)).map(s => s.prn);

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

// #468: FAST is the same receiver as REAL. With FAST's former timeout of 1 s the lost satellite turned Unreachable (*PP-)
// and stayed out for an hour
describe.each([
    {name: 'REAL', fastGpsAcquisition: false},
    {name: 'FAST', fastGpsAcquisition: true},
])('the antenna tilts with the aircraft, $name (#467, #468, characterization)', ({fastGpsAcquisition}) => {
    it('a right bank loses the lowest satellite when it is on the left, the outside of the turn: *PP  00 on STA 1, and the satellites on the right stay', async () => {
        const {unit, low, view} = await flyingUnit(true, {fastGpsAcquisition});
        await unit.panel.selectPage('L', 'STA 1');
        const heading = azimuth(low) + 90; // The satellite is 90 degrees to the left of the nose
        const rightSide = satellites(unit).filter(s => inUse(s) && relative(s, heading) > 30).map(s => s.prn);
        expect(rightSide.length).toBeGreaterThan(0); // Precondition: satellites on the low-wing side to check
        expect(lostOf(unit, view)).toEqual([]); // Precondition

        fly(unit, heading, -30); // MSFS: a bank of 30 degrees to the right
        await twoCalcTicks(unit);

        const signals = gpsOf(unit).signals;
        expect(signals.isLost(low.prn)).toBe(true);
        expect(satellites(unit).find(s => s.prn === low.prn)!.state.get()).toBe(GPSSatelliteState.None);
        const ele = String(Math.round(elevationDeg(low))).padStart(2, '0');
        const rows = (await satelliteRows(unit)).filter(r => Number(r.slice(1, 3)) === low.prn);
        expect(rows).toEqual([`*${String(low.prn).padStart(2, '0')}  00 ${ele}°`]);
        expect(rightSide.filter(prn => signals.isLost(prn))).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('level again, the lost satellite is in use again within 20 s', async () => {
        const {unit, low} = await flyingUnit(true, {fastGpsAcquisition});
        const heading = azimuth(low) + 90;
        fly(unit, heading, -30);
        await twoCalcTicks(unit);
        expect(gpsOf(unit).signals.isLost(low.prn)).toBe(true); // Precondition

        fly(unit, heading, 0);
        let back = -1;
        for (let s = 1; s <= 20 && back < 0; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            if (inUse(satellites(unit).find(sat => sat.prn === low.prn)!)) {
                back = s;
            }
        }

        expect(back).toBeGreaterThan(0);
        expect(gpsOf(unit).signals.isLost(low.prn)).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

describe('the antenna tilts with the aircraft (#467, characterization)', () => {
    it('MSFS bank signs: a left bank (positive) keeps the low satellite on the left and loses low ones on the right instead', async () => {
        const {unit, low, view} = await flyingUnit();
        const heading = azimuth(low) + 90; // low is on the left
        fly(unit, heading, 30); // MSFS: a bank of 30 degrees to the LEFT, the left wing is down
        await twoCalcTicks(unit);
        const signals = gpsOf(unit).signals;

        expect(signals.isLost(low.prn)).toBe(false);
        const lost = view.filter(s => signals.isLost(s.prn));
        expect(lost.length).toBeGreaterThan(0); // The low satellites on the right are lost instead
        expect(lost.filter(s => relative(s, heading) <= 0).map(s => s.prn)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('nose up 20 degrees weakens the lowest satellite when it is ahead and strengthens it when it is behind', async () => {
        const {unit, low} = await flyingUnit();
        const signals = gpsOf(unit).signals;
        const snrAt = async (heading: number, msfsPitch: number): Promise<number> => {
            fly(unit, heading, 0, msfsPitch);
            await twoCalcTicks(unit);
            return signals.snr(low.prn);
        };

        const aheadLevel = await snrAt(azimuth(low), 0);
        const aheadUp = await snrAt(azimuth(low), -20);
        const behindLevel = await snrAt(azimuth(low) + 180, 0);
        const behindUp = await snrAt(azimuth(low) + 180, -20);

        expect(aheadLevel).toBeCloseTo(behindLevel, 1); // Level, the heading does not matter (the satellite moves a little between the readings)
        expect(aheadUp).toBeLessThan(aheadLevel - 3);
        expect(behindUp).toBeGreaterThan(behindLevel + 3);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('the default test platform keeps the antenna level whatever the SimVars say: a bank of 60 degrees loses nothing', async () => {
        const {unit, low, view} = await flyingUnit(false);
        fly(unit, azimuth(low) + 90, -60);
        await twoCalcTicks(unit);

        expect(lostOf(unit, view)).toEqual([]);
        expect(satellites(unit).filter(inUse).length).toBeGreaterThanOrEqual(6);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

describe('the harness aircraft writes the MSFS attitude (#467, characterization)', () => {
    it('a right bank is a negative PLANE BANK DEGREES, the pitch is level and the aircraft is in the air', async () => {
        const unit = await bootUnit();
        const aircraft = new Aircraft({lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 100, trackTrue: 90});
        aircraft.step(10, 20); // Commands a right bank of 20 degrees; the roll rate reaches it in 4 s
        expect(aircraft.bankDeg).toBe(20); // Precondition: the aircraft's own sign is positive to the right

        aircraft.writeTo(unit.env.sim, 0);

        expect(SimVar.GetSimVarValue('PLANE BANK DEGREES', 'degrees')).toBe(-20);
        expect(SimVar.GetSimVarValue('PLANE PITCH DEGREES', 'degrees')).toBe(0);
        expect(SimVar.GetSimVarValue('SIM ON GROUND', 'bool')).toBeFalsy();
    }, 30_000);
});
