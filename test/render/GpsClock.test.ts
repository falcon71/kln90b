import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {storedSetting} from '../harness/storage';
import {openFlr1} from '../harness/render/flrPages';

// #461: the unit's clock is kept across sessions as an offset from the sim time. These are characterizations of this
// simulation's design (docs/superpowers/specs/2026-11-08-failures-battery-design.md, "The clock across sessions"); no
// manual page is cited.
const ERA_MS = 1024 * 7 * 86_400_000;
const TOLERANCE_MS = 3000;
const SLOW = 120_000;

/** The sim's time in UNIX ms, from the fake clock and the sim's offset, not from the unit */
const simNowMs = (unit: HeadlessUnit) => Date.now() + unit.env.sim.absoluteTimeOffsetMs;
const clock = (unit: HeadlessUnit) => unit.props.sensors.in.gps.timeZulu.getTimestamp();
const BEHIND = {clockOffset: -2 * ERA_MS};

async function service(unit: HeadlessUnit): Promise<void> {
    await openFlr1(unit);
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'SERVICE?');
    await unit.panel.ent();
    await unit.panel.ent();
}

describe('the clock across sessions (#461)', () => {
    it('a first start keeps the sim date', async () => {
        const unit = await bootUnit();
        await settle(unit);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        await vi.advanceTimersByTimeAsync(61_000);
        expect(Math.abs((storedSetting(unit, 'clockOffset') as number | undefined) ?? 0)).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('a clock two eras behind survives the session', async () => {
        const unit = await bootUnit({storage: {...BEHIND, fastGpsAcquisition: false}});
        await settle(unit);

        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('FAST keeps the era and stays hot', async () => {
        const unit = await bootToSelfTest({storage: {...BEHIND, fastGpsAcquisition: true}});
        await unit.panel.ent();
        const powerOn = Date.now();
        await settle(unit, 60);

        expect(Date.now() - powerOn).toBeLessThan(60_000);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('the SET 10 switch from REAL to FAST during a search keeps the era and stays hot', async () => {
        const unit = await bootUnit({storage: {...BEHIND, fastGpsAcquisition: false}, coldGps: true});
        unit.props.userSettings.getSetting('fastGpsAcquisition').set(true);
        unit.props.sensors.in.gps.startFast();
        const start = Date.now();
        await settle(unit, 60);

        expect(Date.now() - start).toBeLessThan(60_000);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('SERVICE? corrects the era', async () => {
        const unit = await bootUnit({storage: {...BEHIND, fastGpsAcquisition: false}});
        await settle(unit);
        await service(unit);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(Math.abs(storedSetting(unit, 'clockOffset') as number)).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('SERVICE? before the first fix corrects the era, which the first fix keeps', async () => {
        const unit = await bootUnit({storage: {...BEHIND, fastGpsAcquisition: false}, coldGps: true});
        await service(unit);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);

        await settle(unit);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('a SET 2 date entry before the fix corrects the era', async () => {
        const unit = await bootUnit({storage: {...BEHIND, fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.enterDate('L', 1, 6, [2, 6]); //The fake clock starts on 1 June 2026
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        //Saved by the entry itself, before any fix or the periodic save
        expect(Math.abs(storedSetting(unit, 'clockOffset') as number)).toBeLessThan(TOLERANCE_MS);
        await settle(unit);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('a fix saves the corrected clock at once, not only with the periodic save', async () => {
        const unit = await bootUnit({storage: {clockOffset: 3_600_000, fastGpsAcquisition: false}});
        await settle(unit);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Math.abs(storedSetting(unit, 'clockOffset') as number)).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('the offset is saved at the power-off', async () => {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        gps.timeZulu.setTimestamp(simNowMs(unit) - 2 * ERA_MS);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);

        expect(Math.abs((storedSetting(unit, 'clockOffset') as number) - (-2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('a clockOffset that is not a number is 0', async () => {
        const unit = await bootUnit({storage: {clockOffset: 'x'}});

        expect(unit.errors).toEqual([]);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);
});
