import {afterEach, describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, untilCalcTick} from '../../harness/boot';
import {courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {standardRoute} from '../../harness/fixtures';
import {BASE, FIXED_OUTPUTS, NAV_DATA, routed, SIM_VARS} from '../../harness/interconnect';
import {panelXml, PanelOptions} from '../../harness/panelXml';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {SimVarWrite} from '../../harness/sim/FakeSim';
import {FailureKey} from '../../../kln90b/failures/FailureCatalog';

/**
 * #458: a failed output port sends nothing. At the failure, at a power change and when the unit claims the GPS SimVars
 * again, it writes its null state once (docs/failures.md, "A failed port in general"; the design
 * docs/superpowers/specs/2026-11-04-failures-framework-design.md, "The ports"). The SimVars of a port are those of the
 * SimVar-to-port table of #451 (test/harness/interconnect.ts).
 */

/**
 * The null state of every output, as written literals: what SensorsOut.reset and setPoweredOff wrote before #458. A
 * boolean reads 0, a string ''. GPS CDI SCALING is 5 NM in meters
 */
const NULL_VALUES: Record<string, number | string> = {
    'L:KLN90B_XTK': 0, 'L:KLN90B_ROLLCOMMAND': 0, 'L:KLN90B_INTEGRITYWARN': 0, 'L:KLN90B_GPS_WP_BEARING': 0,
    'L:KLN90B_HSI_TF_FLAGS': 0, 'L:KLN90B_MSGLIGHT': 0, 'L:KLN90B_WPTLIGHT': 0, 'L:KLN90B_ANNUNTEST': 0,
    'GPS WP ETE': 0, 'GPS WP ETA': 0, 'GPS ETE': 0, 'GPS ETA': 0, 'GPS COURSE TO STEER': 0,
    'GPS WP CROSS TRK': 0, 'GPS CDI SCALING': 9260, 'GPS IS ACTIVE FLIGHT PLAN': 0, 'GPS IS ACTIVE WAY POINT': 0,
    'GPS APPROACH MODE': 0,
    'GPS GSI SCALING': 0, 'GPS VERTICAL ANGLE': 0, 'GPS VERTICAL ANGLE ERROR': 0, 'GPS VERTICAL ERROR': 0,
    'GPS HAS GLIDEPATH': 0,
    'GPS OBS VALUE': 0, 'GPS WP TRACK ANGLE ERROR': 0, 'GPS WP DESIRED TRACK': 0, 'GPS WP BEARING': 0,
    'GPS WP TRUE BEARING': 0, 'GPS WP DISTANCE': 0, 'GPS MAGVAR': 0, 'GPS POSITION LAT': 0, 'GPS POSITION LON': 0,
    'GPS GROUND SPEED': 0, 'GPS GROUND TRUE TRACK': 0, 'GPS GROUND MAGNETIC TRACK': 0, 'GPS FLIGHT PLAN WP COUNT': 0,
    'GPS FLIGHT PLAN WP INDEX': 0, 'GPS WP NEXT ID': '', 'GPS WP NEXT LAT': 0, 'GPS WP NEXT LON': 0,
    'GPS WP PREV VALID': 0, 'GPS WP PREV ID': '', 'GPS WP PREV LAT': 0, 'GPS WP PREV LON': 0,
    'GPS IS APPROACH ACTIVE': 0,
};

/** The output table of the default interfaces */
const DEFAULT_TABLE = {...FIXED_OUTPUTS, ...routed('ARINC 429 TX', 'OBI', 'RS-232 IN', 'OBS resolver', 'ARINC 429 EFIS RX')};
/** With Output.DataInterface RS232 */
const RS232_TABLE = {...FIXED_OUTPUTS, ...routed('RS-232 OUT', 'OBI', 'RS-232 IN', 'OBS resolver', 'ARINC 429 EFIS RX')};

/** The SimVars of a port in the table; key events (K:) are not SimVars and have no null state */
const simVarsOf = (table: Record<string, string>, port: string): string[] =>
    Object.entries(table).filter(([name, p]) => p === port && !name.startsWith('K:')).map(([name]) => name);
const keyEventsOf = (table: Record<string, string>, port: string): string[] =>
    Object.entries(table).filter(([name, p]) => p === port && name.startsWith('K:')).map(([name]) => name);

/** name → the values written, in order, for the names given */
function valuesByName(writes: SimVarWrite[], names: string[]): Record<string, (number | string)[]> {
    const out: Record<string, (number | string)[]> = {};
    for (const w of writes) {
        if (names.includes(w.name)) {
            (out[w.name] ??= []).push(w.value);
        }
    }
    return out;
}

/** Each name written exactly once, with its null value */
/** The output-transmitted LVars (LVars.ts, TransmitterStatus), written once at a failure change */
const transmittedLVars = (arinc429: number, rs232: number) => ({'L:KLN90B_ARINC429OUTPUTTRANSMITTED': [arinc429], 'L:KLN90B_RS232OUTPUTTRANSMITTED': [rs232]});
const onceNull = (names: string[]) => Object.fromEntries(names.map(name => [name, [NULL_VALUES[name]]]));

/** Every name was last written at or after the mark, with its null value */
function expectNullSince(unit: HeadlessUnit, names: string[], mark: number) {
    const writes = unit.env.sim.writes;
    const wrong = names.filter(name => {
        const last = unit.env.sim.lastWrite(name);
        return last === undefined || writes.lastIndexOf(last) < mark || last.value !== NULL_VALUES[name];
    });
    expect(wrong).toEqual([]);
}

/**
 * Every input of the table switched on (its BASE), 0.5 NM right of the leg KAAA - ABC and banking back, so the cross
 * track, the roll command and the D-bar are not 0. The position holds afterwards, so the values stay
 */
async function offCourse(o: PanelOptions = {}): Promise<HeadlessUnit> {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: panelXml({...BASE, ...o}), simVars: SIM_VARS, magvar: 0});
    const mid = pointBefore(kaaa, abc, 10);
    const dtk = courseDeg(mid, abc);
    await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.5), {groundspeedKt: 120, trackTrue: dtk});
    await vi.advanceTimersByTimeAsync(3000);
    expect(unit.errors).toEqual([]);
    return unit;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('a failed output port (#458)', () => {
    it('every SimVar of the failable ports has a null value', () => {
        const failable = [...simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX'), ...simVarsOf(DEFAULT_TABLE, 'OBI'),
            ...simVarsOf(RS232_TABLE, 'RS-232 OUT')];

        expect(failable.filter(name => !(name in NULL_VALUES))).toEqual([]);
    });

    it('a failed ARINC 429 port writes its null state once, then nothing', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const port = simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX');
        const portKeys = keyEventsOf(DEFAULT_TABLE, 'ARINC 429 TX');
        const analog = simVarsOf(DEFAULT_TABLE, 'Analog nav');
        // Preconditions: live values, and the port's key events are sent
        expect(sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0);
        expect(sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(3);
        expect(Math.abs(sim.get('L:KLN90B_XTK', 'nautical miles'))).toBeGreaterThan(0.4);
        expect(sim.get('L:KLN90B_RollCommand', 'degrees')).not.toBe(0);
        expect([...new Set(sim.keyEvents.map(k => k.name).filter(name => portKeys.includes(name)))].sort()).toEqual([...portKeys].sort());
        await untilCalcTick(unit); // The next calculation tick is 750 to 1000 ms away
        const xtkBefore = sim.get('GPS WP CROSS TRK', 'nautical miles');
        expect(Math.abs(xtkBefore)).toBeGreaterThan(0.4);
        const mark = sim.writes.length;
        // The course the unit sends (the DTK in LEG mode) is a state the null state does not change
        const obsOutBefore = unit.props.sensors.out.obsOut;
        expect(obsOutBefore).not.toBeNull();

        unit.props.failures.fail('arinc429Out');

        expect(unit.props.sensors.out.obsOut).toBe(obsOutBefore);
        // The port's SimVars once each with their null value; the other ports write nothing in the pass
        expect(valuesByName(sim.writes.slice(mark), Object.keys(DEFAULT_TABLE))).toEqual({...onceNull(port), ...transmittedLVars(0, 0)});
        // Besides them only the two output-transmitted LVars, which say the failure itself (LVars.ts)
        expect(sim.writes.slice(mark).map(w => w.name).filter(name => !port.includes(name)))
            .toEqual(['L:KLN90B_ARINC429OUTPUTTRANSMITTED', 'L:KLN90B_RS232OUTPUTTRANSMITTED']);

        // Before the next calculation tick: the D-bar filter is not touched by the null state
        await vi.advanceTimersByTimeAsync(600);
        expect(Math.abs(sim.get('GPS WP CROSS TRK', 'nautical miles') - xtkBefore)).toBeLessThan(0.01);

        const afterFailure = sim.writes.length;
        const keysAfterFailure = sim.keyEvents.length;
        await vi.advanceTimersByTimeAsync(5000);

        expect(valuesByName(sim.writes.slice(afterFailure), port)).toEqual({});
        expect(sim.keyEvents.slice(keysAfterFailure).map(k => k.name).filter(name => portKeys.includes(name))).toEqual([]);
        // The analog port keeps its live values
        expect(Object.keys(valuesByName(sim.writes.slice(afterFailure), analog)).sort()).toEqual([...analog].sort());
        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(1);
        expect(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);
        expect(Math.abs(sim.get('GPS WP CROSS TRK', 'nautical miles') - xtkBefore)).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    });

    it('the null values equal the power-off values', async () => {
        const unit = await offCourse();
        const mark = unit.env.sim.writes.length;

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);

        // The ticks stop with the power, so the last write of each output is the power-off's
        expectNullSince(unit, Object.keys(NULL_VALUES), mark);
    });

    /** live: a SimVar of the port that is not null before the failure; other: one of another port, which keeps writing */
    const ports: { name: string, key: FailureKey, options: PanelOptions, table: Record<string, string>, port: string, live: string, other: string, transmittedLVars: Record<string, number[]> }[] = [
        {name: 'RS-232', key: 'rs232Out', options: {'Output.DataInterface': 'RS232'}, table: RS232_TABLE, port: 'RS-232 OUT', live: 'GPS WP DISTANCE', other: 'L:KLN90B_XTK', transmittedLVars: transmittedLVars(1, 0)},
        {name: 'OBI', key: 'rmiOutput', options: {'Output.RmiInstalled': true}, table: DEFAULT_TABLE, port: 'OBI', live: 'L:KLN90B_GPS_WP_BEARING', other: 'GPS WP DISTANCE', transmittedLVars: transmittedLVars(1, 0)},
    ];
    for (const c of ports) {
        it(`a failed ${c.name} port writes its null state once, then nothing`, async () => {
            const unit = await offCourse(c.options);
            const sim = unit.env.sim;
            const port = simVarsOf(c.table, c.port);
            expect(port.length).toBeGreaterThan(0);
            expect(sim.lastWrite(c.live)?.value).not.toBe(NULL_VALUES[c.live.toUpperCase()]); // Precondition: live
            const mark = sim.writes.length;

            unit.props.failures.fail(c.key);

            expect(valuesByName(sim.writes.slice(mark), Object.keys(c.table))).toEqual({...onceNull(port), ...c.transmittedLVars});
            const afterFailure = sim.writes.length;
            await vi.advanceTimersByTimeAsync(5000);
            expect(valuesByName(sim.writes.slice(afterFailure), port)).toEqual({});
            // The other ports keep writing
            expect(sim.writes.slice(afterFailure).some(w => w.name === c.other.toUpperCase())).toBe(true);
            expect(unit.errors).toEqual([]);
        });
    }

    // rmiOutput needs Output.RmiInstalled (FailureCatalog): stored without it, the failure fails nothing
    it('a failure of a part the aircraft does not have writes no null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const mark = sim.writes.length;

        unit.props.failures.fail('rmiOutput');
        await vi.advanceTimersByTimeAsync(2000);

        expect(sim.writes.slice(mark).filter(w => w.name === 'L:KLN90B_GPS_WP_BEARING').map(w => w.value)
            .filter(v => v === 0)).toEqual([]);
    });

    it('a power-on while failed writes the null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const port = simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX');
        unit.props.failures.fail('arinc429Out');
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
        const mark = sim.writes.length;

        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5000);

        const writes = sim.writes.slice(mark).filter(w => port.includes(w.name));
        expect(valuesByName(writes, port)).toEqual(onceNull(port));
        expect(new Set(writes.map(w => w.time)).size).toBe(1); // In one pass
        expect(unit.errors).toEqual([]);
    });

    // #350: a unit disabled for hot swapping has released the GPS SimVars to the unit that replaced it
    it('a failure while disabled for hot swapping writes no GPS SimVar', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const portGps = simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX').filter(name => !name.startsWith('L:'));
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(500);
        sim.set('GPS WP DISTANCE', 'meters', 12345);
        const mark = sim.writes.length;

        unit.props.failures.fail('arinc429Out');

        expect(valuesByName(sim.writes.slice(mark), portGps)).toEqual({});
        expect(sim.get('GPS WP DISTANCE', 'meters')).toBe(12345);
    });

    // A stored failure is effective from the boot on, and the boot claims the GPS SimVars before any power-on
    it('a cold-and-dark boot with a stored failure writes the null state of the failed port', async () => {
        const portGps = simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX').filter(name => !name.startsWith('L:'));
        const unit = await bootUnit({
            engineRunning: false, storage: {failure_arinc429Out: '{}'},
            simVars: [{name: 'GPS WP DISTANCE', unit: 'meters', value: 12345}, {name: 'GPS FLIGHT PLAN WP COUNT', unit: 'number', value: 3}],
        });

        expect(unit.env.sim.get('GPS WP DISTANCE', 'meters')).toBe(0);
        expect(unit.env.sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(0);
        expectNullSince(unit, portGps, 0);
        expect(unit.errors).toEqual([]);
    });

    it('a repair brings live values at the next tick', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        unit.props.failures.fail('arinc429Out');
        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.get('GPS WP DISTANCE', 'meters')).toBe(0); // Precondition

        unit.props.failures.repair('arinc429Out');
        await untilCalcTick(unit);

        expect(sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0);
        expect(sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(3);
        expect(Math.abs(sim.get('L:KLN90B_XTK', 'nautical miles'))).toBeGreaterThan(0.4);
        expect(sim.get('L:KLN90B_RollCommand', 'degrees')).not.toBe(0);
    });

    // Another GPS of a hot-swap aircraft wrote the SimVars while the KLN was disabled
    it('a resume writes the null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        unit.props.failures.fail('arinc429Out');
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(500);
        sim.set('GPS WP DISTANCE', 'meters', 12345);
        sim.set('GPS FLIGHT PLAN WP COUNT', 'number', 3);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(200); // The next poll of SimVarSync

        expect(sim.get('GPS WP DISTANCE', 'meters')).toBe(0);
        expect(sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(0);
        expect(unit.errors).toEqual([]);
    });

    // The sim's own GPS wrote the SimVars while the option was off
    it('a runtime switch-on writes the null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const portGps = simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX').filter(name => !name.startsWith('L:'));
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        unit.props.failures.fail('arinc429Out');
        sim.set('GPS WP DISTANCE', 'meters', 12345);
        const mark = sim.writes.length;

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(200); // The next poll of SimVarSync

        expect(sim.get('GPS WP DISTANCE', 'meters')).toBe(0);
        expectNullSince(unit, portGps, mark);
        expect(unit.errors).toEqual([]);
    });

    /** The port's GPS SimVars whose live value is not their null value, so that a null write shows */
    const liveGps = (unit: HeadlessUnit) => simVarsOf(DEFAULT_TABLE, 'ARINC 429 TX')
        .filter(name => !name.startsWith('L:') && unit.env.sim.lastWrite(name) !== undefined
            && unit.env.sim.lastWrite(name)!.value !== NULL_VALUES[name]);
    /** The writes of a null value since the mark, of the names given */
    const nullWritesSince = (unit: HeadlessUnit, names: string[], mark: number) =>
        unit.env.sim.writes.slice(mark).filter(w => names.includes(w.name) && w.value === NULL_VALUES[w.name]).map(w => w.name);

    // With nothing failed, the unit claims the GPS SimVars and the next tick writes live values; a null state in between
    // would zero the guidance of a coupled autopilot for up to a second
    it('a resume with nothing failed writes no null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const live = liveGps(unit);
        expect(live).toEqual(expect.arrayContaining(['GPS WP DISTANCE', 'GPS FLIGHT PLAN WP COUNT'])); // Precondition
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(500);
        sim.set('GPS WP DISTANCE', 'meters', 12345);
        const mark = sim.writes.length;

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(nullWritesSince(unit, live, mark)).toEqual([]);
        expect(sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0);
        expect(sim.get('GPS WP DISTANCE', 'meters')).not.toBe(12345); // The live value came back
    });

    it('a runtime switch-on with nothing failed writes no null state', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        const live = liveGps(unit);
        expect(live).toEqual(expect.arrayContaining(['GPS WP DISTANCE', 'GPS FLIGHT PLAN WP COUNT'])); // Precondition
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        sim.set('GPS WP DISTANCE', 'meters', 12345);
        const mark = sim.writes.length;

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(nullWritesSince(unit, live, mark)).toEqual([]);
        expect(sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0);
        expect(sim.get('GPS WP DISTANCE', 'meters')).not.toBe(12345);
    });
});
