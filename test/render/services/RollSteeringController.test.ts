import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';

const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';

const roll = (unit: HeadlessUnit): number => unit.env.sim.get('L:KLN90B_RollCommand', 'degrees');

/** FPL 0 is KAAA, ABC, KBBB and the aircraft stands at KAAA; ABC is active after the settle */
async function onRoute(panelXml?: string) {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb],
        storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        position: {lat: kaaa.lat, lon: kaaa.lon},
        panelXml,
        magvar: 0,
    });
    await settle(unit);
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
    // 10 NM before ABC, on the course of the leg
    const mid = pointBefore(kaaa, abc, 10);
    return {unit, kaaa, abc, mid, dtk: courseDeg(mid, abc)};
}

// Public contract: the Autopilot wiki page and the doc comment of LVAR_ROLL_COMMAND in LVars.ts: the roll command is in
// degrees, a left bank is positive and a right bank negative. The Installation Manual (2-69) lets the unit give roll
// steering only with a heading input; these tests run with HeadingInput on, the case without is pinned below (#143).
describe('L:KLN90B_RollCommand (public contract)', () => {
    it('is written as 0 without a flight plan', async () => {
        const unit = await bootUnit({panelXml: HEADING_INPUT_XML});
        await settle(unit);

        // lastWrite: an unset LVar reads 0 as well
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });

    // Installation Manual 2-70: roll steering needs a ground speed (the page names no threshold). The aircraft is 2 NM off
    // the leg, where it would bank if it moved
    it('is 0 without ground speed, off the leg (2-70)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 0});

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });

    // The leg lies to the left of an aircraft that is right of the course (looking along it), so the bank is left
    it('is positive, a left bank, when the leg is to the left', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeGreaterThan(0);
    });

    it('is negative, a right bank, when the leg is to the right', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk - 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeLessThan(0);
    });

    // Autopilot wiki: at most 30 degrees once the aircraft is in range of the leg. 0.3 NM right of the course, flying
    // straight at the leg at 200 kt, needs more than that, so the cap decides
    it('is -30 degrees, the cap, when more is needed to join the leg', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.3), {groundspeedKt: 200, trackTrue: (dtk + 270) % 360});

        // Flying at the leg from its right with the course ahead and to the right: the turn onto it is a right bank, and
        // the cap is the value
        expect(roll(unit)).toBeCloseTo(-30, 6);
    });

    // The wiki names no value for the intercept of a far leg; the code banks 25 degrees (MAX_BANK_ANGLE)
    it('is 25 degrees on a 45 degree intercept (characterization)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeCloseTo(25, 6);
    });
});

// Installation Manual 2-69: without a heading input the unit gives no roll steering output. RollSteeringController
// ignores Input.HeadingInput and always writes the command.
describe('L:KLN90B_RollCommand without a heading input (public contract)', () => {
    it('the pin setup: HeadingInput is off, ABC is active and the aircraft is 2 NM off the leg at 120 kt', async () => {
        const {unit, abc, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe(abc.icaoStruct.ident);
        expect(unit.props.memory.navPage.xtkToActive).toBeCloseTo(2, 1);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 6);
    });

    it.fails('is 0 (#143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });
});
