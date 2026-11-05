import {afterEach, describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle, untilCalcTick} from '../../harness/boot';
import {courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {standardRoute} from '../../harness/fixtures';
import {BASE, FIXED_OUTPUTS, routed, SIM_VARS} from '../../harness/interconnect';
import {panelXml} from '../../harness/panelXml';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {SimVarWrite} from '../../harness/sim/FakeSim';
import {bootOnStandardRoute} from '../../harness/worldBoot';

/**
 * #459: the NAV superflag (P901 pin 18) fails (docs/failures.md, "NAV superflag" and "A failed port in general"; the
 * design docs/superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md, "The superflag port"). Its sim
 * stand-ins, L:KLN90B_HSI_TF_FLAGS and GPS IS ACTIVE WAY POINT/FLIGHT PLAN, read flagged; the deviation keeps working
 */

const FLAGS = ['L:KLN90B_HSI_TF_FLAGS', 'GPS IS ACTIVE FLIGHT PLAN', 'GPS IS ACTIVE WAY POINT'];

/** The output table of the default interfaces */
const DEFAULT_TABLE = {...FIXED_OUTPUTS, ...routed('ARINC 429 TX', 'OBI', 'RS-232 IN', 'OBS resolver', 'ARINC 429 EFIS RX')};

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

/** A failure stored by an earlier session */
const failed = (key: string) => ({[`failure_${key}`]: '{}'});

const superflagMessages = (unit: HeadlessUnit) => messages(unit).filter(m => m.includes('SUPER FLAG'));

/**
 * A copy of FailedOutputs.test.ts' helper: every input switched on, 0.5 NM right of the leg KAAA - ABC and banking back,
 * so the cross track is not 0 and the flags are valid. The position holds afterwards, so the values stay
 */
async function offCourse(): Promise<HeadlessUnit> {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: panelXml(BASE), simVars: SIM_VARS, magvar: 0});
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

describe('the superflag failure (#459)', () => {
    it('a failed superflag writes the flagged values once, then nothing', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        // Preconditions: the flags are valid
        expect(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);
        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(1);
        expect(sim.get('GPS IS ACTIVE FLIGHT PLAN', 'bool')).toBe(1);
        await untilCalcTick(unit);
        const xtkBefore = sim.get('GPS WP CROSS TRK', 'nautical miles');
        expect(Math.abs(xtkBefore)).toBeGreaterThan(0.4);
        const mark = sim.writes.length;

        unit.props.failures.fail('superflag');

        // The flags once each, flagged; besides them only the output-transmitted LVars, which TransmitterStatus writes at
        // every failure change (the ARINC 429 output transmits, the RS-232 one does not carry the nav data)
        expect(valuesByName(sim.writes.slice(mark), Object.keys(DEFAULT_TABLE))).toEqual({
            'L:KLN90B_HSI_TF_FLAGS': [0], 'GPS IS ACTIVE FLIGHT PLAN': [0], 'GPS IS ACTIVE WAY POINT': [0],
            'L:KLN90B_ARINC429OUTPUTTRANSMITTED': [1], 'L:KLN90B_RS232OUTPUTTRANSMITTED': [0],
        });

        const afterFailure = sim.writes.length;
        await vi.advanceTimersByTimeAsync(5000);

        const later = sim.writes.slice(afterFailure);
        expect(valuesByName(later, FLAGS)).toEqual({});
        // The deviation keeps working
        expect(Object.keys(valuesByName(later, ['GPS WP CROSS TRK', 'GPS CDI SCALING'])).sort())
            .toEqual(['GPS CDI SCALING', 'GPS WP CROSS TRK']);
        expect(Math.abs(sim.get('GPS WP CROSS TRK', 'nautical miles') - xtkBefore)).toBeLessThan(0.01);
        expect(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(0);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('the repair restores the flags', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        unit.props.failures.fail('superflag');
        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0); // Precondition
        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(0);

        unit.props.failures.repair('superflag');
        await untilCalcTick(unit);

        expect([1, 2]).toContain(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum'));
        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(1);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The boot's own pass does not write the flag LVar: an instrument reload leaves what the last session wrote
    it('a boot with the superflag failed writes the flagged values', async () => {
        const unit = await bootUnit({
            storage: failed('superflag'),
            simVars: [{name: 'L:KLN90B_HSI_TF_FLAGS', unit: 'enum', value: 1}],
        });

        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // Another GPS of a hot-swap aircraft wrote the SimVars while the KLN was disabled
    it('a resume writes the flagged values', async () => {
        const unit = await offCourse();
        const sim = unit.env.sim;
        unit.props.failures.fail('superflag');
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(500);
        sim.set('GPS IS ACTIVE WAY POINT', 'bool', true);
        sim.set('GPS IS ACTIVE FLIGHT PLAN', 'bool', true);
        sim.set('L:KLN90B_HSI_TF_FLAGS', 'enum', 1);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(200); // The next poll of SimVarSync

        expect(sim.get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(0);
        expect(sim.get('GPS IS ACTIVE FLIGHT PLAN', 'bool')).toBe(0);
        expect(sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The self-test sets FROM, so the flag is commanded valid on the Self Test page; detection starts with the first
    // navigation page (design, "Detection")
    it('NAV SUPER FLAG FAILURE shows with the first navigation page, and TEST FAIL on the Self Test page', async () => {
        const unit = await bootToSelfTest({storage: failed('superflag')});
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
        await vi.advanceTimersByTimeAsync(2000);
        expect(superflagMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page

        expect(superflagMessages(unit)).toEqual(['NAV SUPER FLAG FAILURE']);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // docs/failures.md, "Detection": the superflag is seen only while the flag is supposed to be valid
    it('a superflag failed without an active waypoint is not detected', async () => {
        const position = {lat: 47, lon: 8};
        const unit = await bootUnit({position, storage: {lastLatitude: position.lat, lastLongitude: position.lon}});
        await settle(unit);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0); // Precondition: the flag is commanded invalid

        unit.props.failures.fail('superflag');
        await vi.advanceTimersByTimeAsync(10_000);

        expect(superflagMessages(unit)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The boot call of FailureOutputs.writeFailedNullStates writes only failed ports
    it('nothing failed: a boot leaves the flag LVar alone', async () => {
        const unit = await bootUnit({
            engineRunning: false,
            simVars: [{name: 'L:KLN90B_HSI_TF_FLAGS', unit: 'enum', value: 1}],
        });

        expect(unit.env.sim.writes.filter(w => w.name === 'L:KLN90B_HSI_TF_FLAGS')).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 30_000);
});
