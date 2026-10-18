import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {courseDeg, finalCourseDeg} from '../../harness/flight/geo';
import {messages} from '../../harness/readers';
import {TICK_TIME_DISPLAY} from '../../../kln90b/TickController';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';
import {blinkCycle} from '../../harness/render/blink';
import {readRows} from '../../harness/render/screen';
import {showSuperNav5, SuperNav5} from '../../harness/render/superNav5';
import {savedFlightplan} from '../../harness/storage';
import {APR_ARM_SWITCH, NO_OBS, panelXml, PanelOptions} from '../../harness/panelXml';
import {bootOnStandardRoute} from '../../harness/worldBoot';

/**
 * The mode glyphs of the KLN font (kln90b.ttf), read by drawing each code point: Ê is ENR, Ë is LEG, Í is ARM and Ì is
 * APR, each in one cell. So 'Ê-Ë' reads ENR-LEG.
 */
const ENR = 'Ê', LEG = 'Ë', ARM = 'Í', APR = 'Ì';

/** The approach of approachWorld() loaded, the aircraft 2.5 NM before the FAF and armed (6-3) */
async function armed(keys: PanelOptions = {}): Promise<{ unit: HeadlessUnit, w: ReturnType<typeof approachWorld> }> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(7.5), panelXml: panelXml({...APR_ARM_SWITCH, ...keys}),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    // Long enough for the XTK scale to ramp to its ARM value after the unit has armed within 30 NM (30 s,
    // ModeController.adjustXtkScaleArm), so that the approach is in its settled ARM state
    await vi.advanceTimersByTimeAsync(31_000);
    return {unit, w};
}

/** The text and the mask of the message prompt over the map (3-36) */
const mapPrompt = () => {
    const row = readRows(document.querySelector('#pageContainer .super-nav5-mgs-range')!)[0];
    return `${row.map(c => c.ch).join('')} ${row.map(c => c.attr).join('')}`;
};

/** What the prompt shows on 8 display ticks (two seconds), as two blink cycles of four reads each */
async function mapPromptCycles(): Promise<string[][]> {
    const first = await blinkCycle(mapPrompt);
    return [first, await blinkCycle(mapPrompt)];
}

/** Super NAV 5 on the standard route in the enroute OBS mode (OBS selected on the first leg, no external OBS input) */
async function enrouteObs(): Promise<{ unit: HeadlessUnit, course: number }> {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: panelXml(NO_OBS)});
    await unit.panel.obsMode();
    await showSuperNav5(unit);
    return {unit, course: Math.round(finalCourseDeg(kaaa, abc))};
}

// 5-32: the modes are annunciated on the left side of Super NAV 5, with the abbreviations of the table; figure 6-14
// shows ARM-LEG there
describe('Super NAV 5 mode row (5-32)', () => {
    it('shows ARM-LEG in the approach-arm mode (5-32, figure 6-14)', async () => {
        const {unit} = await armed();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}-${LEG}`);
    });

    it('shows APR-LEG in the approach-active mode (5-32)', async () => {
        const {unit, w} = await armed();
        await moveAircraft(unit, w.north(6.5), {groundspeedKt: 120, trackTrue: 180}); // on the final course (6-3)
        await vi.advanceTimersByTimeAsync(1000);
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${APR}-${LEG}`);
    });

    // 5-32: ARM:259, the selected magnetic course after a colon. The final course of approachWorld() is 180 and the
    // variation 0. Without an OBS input the unit picks the course that leaves the deviation unchanged (5-36); the
    // aircraft is on the final course, so that is the DTK, 180
    it('shows ARM: and the OBS course in the approach-arm OBS mode (5-32)', async () => {
        const {unit} = await armed(NO_OBS);
        await unit.panel.obsMode();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}:180`);
    });

    // 5-32: the preconditions of the pin below, ENR and the course 051
    it('shows ENR and the OBS course in the enroute OBS mode (sibling of #321) (5-32)', async () => {
        const {unit, course} = await enrouteObs();

        // The course of the active leg KAAA - ABC at ABC, from the geometry: finalCourseDeg is 51.03, so 051 with the
        // variation of 0. OBS lays its course through the active waypoint, so the unit takes the leg's course there and
        // the deviation stays unchanged (5-36; #151)
        expect(course).toBe(51);
        const mode = SuperNav5.read().left[2];
        expect(mode.startsWith(ENR)).toBe(true);
        expect(mode.endsWith('051')).toBe(true);
    });

    // 5-32: ENR:274, the colon between the mode and the course, as ARM:259 has it (and the code has it for ARM)
    it.fails('shows ENR: and the OBS course in the enroute OBS mode (5-32, #321)', async () => {
        const {unit} = await enrouteObs();

        expect(SuperNav5.read().left[2]).toBe(`${ENR}:051`);
    });
});

// The Super NAV 5 mode row is the 90B's own. The KLN 89 trainer (2026-10-07) shows the OBS course at north as 000, never
// 360; that rule is applied to this row by analogy
describe('Super NAV 5 mode row at north (characterization)', () => {
    it('characterization: shows the OBS course 359.7 in the mode field as 000 (#263)', async () => {
        const {unit} = await enrouteObs();
        unit.props.modeController.setObs(359.7);
        await vi.advanceTimersByTimeAsync(1000);

        expect(SuperNav5.read().left[2]).toBe(`${ENR}000`);
    });

    it('characterization: shows the OBS course 359.4 in the mode field as 359 (#263)', async () => {
        const {unit} = await enrouteObs();
        unit.props.modeController.setObs(359.4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(SuperNav5.read().left[2]).toBe(`${ENR}359`);
    });
});

// 3-36: on Super NAV 5 the message prompt sits in the lower left corner of the map; 3-16: it flashes in inverse video
// while a message is new
describe('Super NAV 5 message prompt (3-16, 3-36)', () => {
    it('flashes msg in inverse video while a message is unread (3-16, 3-36)', async () => {
        const unit = await bootUnit(); // the boot messages are unread (test/README.md section 6)
        await showSuperNav5(unit);

        // A flashing cell shows the flashing phase on one display tick in four (the blink tick) and the steady phase on
        // the other three, on the same tick of both cycles. A set of the values would accept the phases swapped
        const cycles = await mapPromptCycles();
        const expected = ['msg III', 'msg III', 'msg III', 'msg FFF'].sort();
        expect(cycles.map(c => [...c].sort())).toEqual([expected, expected]);
        expect(cycles[1].indexOf('msg FFF')).toBe(cycles[0].indexOf('msg FFF'));
    });

    // 3-10: the three cells of the prompt are blank without a message (3-36 puts the prompt on the map)
    it('shows three blanks without a message (3-10, 3-36)', async () => {
        const unit = await bootUnit();
        await unit.panel.readMessages(); // the two boot messages fit one MSG page; the second press closes it
        expect(unit.props.messageHandler.hasMessages()).toBe(false); // the precondition
        await showSuperNav5(unit);

        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['    ...']));
    });

    // A pilot reaches this state: the ADJ NAV IND CRS message is read and Super NAV 5 shows, then a new message is
    // posted whose condition lapses before it is read (the shape of InsideAirspaceMessage). When the lapse falls between
    // a flashing tick and the next display tick, the element that flashed is the one that must turn steady; whether it
    // does so depends on the timing, so the test calls the message handler's tick itself, right after the flashing tick
    // (the maintainer's ruling, #326)
    it('keeps msg steady when the unread message lapses after a flashing tick (3-16, 3-36, #326)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS TO 046°']); // Preconditions
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        await showSuperNav5(unit);
        const lapsing = new class extends OneTimeMessage {
            public valid = true;

            public isConditionValid(): boolean {
                return this.valid && super.isConditionValid();
            }
        }(['NEW MESSAGE']);
        unit.props.messageHandler.addMessage(lapsing);
        for (let i = 0; i < 8 && mapPrompt() !== 'msg FFF'; i++) {
            await vi.advanceTimersByTimeAsync(TICK_TIME_DISPLAY);
        }
        expect(mapPrompt()).toBe('msg FFF'); // Precondition: the prompt is unread and in its flashing phase

        lapsing.valid = false;
        unit.props.messageHandler.tick();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS TO 046°']); // Precondition: only the read message is left
        await vi.advanceTimersByTimeAsync(TICK_TIME_DISPLAY);

        expect(mapPrompt()).toBe('msg III');
        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['msg III']));
    });

    // 3-16: a message whose condition needs action keeps the prompt on, not flashing, once it is read; 3-36 puts the same
    // prompt on the map. The condition is a wrong external course, as in the status line test (StatusLine.test.ts). The
    // steady inverse once read is the maintainer's ruling (#326)
    it('keeps msg steady in inverse video once read while the condition stays (3-16, 3-36, #326)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS TO 046°']); // Preconditions
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        await showSuperNav5(unit);

        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['msg III']));
    });
});
