import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {courseDeg, finalCourseDeg, pointBefore} from '../../harness/flight/geo';
import {messages, turnStackLength} from '../../harness/readers';
import {TICK_TIME_DISPLAY} from '../../../kln90b/TickController';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';
import {blinkCycle} from '../../harness/render/blink';
import {readRows} from '../../harness/render/screen';
import {showSuperNav5, SuperNav5} from '../../harness/render/superNav5';
import {savedFlightplan} from '../../harness/storage';
import {APR_ARM_SWITCH, NO_OBS, panelXml, PanelOptions} from '../../harness/panelXml';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

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

    // 5-32: ENR and the course 051, the course of the active leg
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
});

// 6-12 and 6-14, figures 6-20 and 6-22: Super NAV 5 in the approach-arm OBS mode with the course set on the external
// indicator shows ARM and the course with no colon and no space (the 5-32 table is the status line's form)
describe('Super NAV 5 mode row in the OBS modes (6-12, 6-14)', () => {
    it('shows ARM and the course without a colon in the approach-arm OBS mode (6-12, 6-14, figures 6-20 and 6-22)', async () => {
        const {unit} = await armed();
        unit.env.sim.set('Nav OBS:1', 'degrees', 180); // the final course of approachWorld(), magvar 0
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        await showSuperNav5(unit);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_OBS); // Precondition
        expect(SuperNav5.read().left[2]).toBe(`${ARM}180`);
    });
});

// The row has no colon in either OBS mode (the maintainer's ruling, #321), also where the course can be entered on the
// unit (NO_OBS), a case no figure shows. The AVsoftech trainer is never a spec source for this row
describe('Super NAV 5 mode row in the OBS modes (characterization)', () => {
    // Without an OBS input the unit picks the course that leaves the deviation unchanged (5-36); the aircraft is on the
    // final course, so that is the DTK, 180. The final course of approachWorld() is 180 and the variation 0
    it('characterization: shows ARM and the course without a colon without an OBS input (#321)', async () => {
        const {unit} = await armed(NO_OBS);
        await unit.panel.obsMode();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}180`);
    });

    // The AVsoftech trainer (unreliable) shows ENR300 in the enroute OBS mode; by analogy with figures 6-20 and 6-22
    // (#321, which expected ENR:)
    it('characterization: shows ENR and the course without a colon or a space in the enroute OBS mode (#321)', async () => {
        const {unit} = await enrouteObs();

        expect(SuperNav5.read().left[2]).toBe(`${ENR}051`);
    });
});

// 5-35: a colon after OBS means the course can be entered on the unit; figures 6-20 and 6-22 (6-12, 6-14) show the
// field where the course is set on the external indicator: OBS, the course and its degree sign, no colon
describe('Super NAV 5 OBS field (5-35, 6-12, 6-14)', () => {
    // The figures' case: the approach-arm OBS mode with the course from the external indicator (armed() keeps the
    // default OBS source, Nav OBS:1), as in the mode row test above
    it('shows OBS, the course and its degree sign without a colon where the course comes from the external indicator (5-35, 6-12, 6-14)', async () => {
        const {unit} = await armed();
        unit.env.sim.set('Nav OBS:1', 'degrees', 180);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[5]).toBe('Ù180°');
    });
});

// The maintainer's reading of 5-35 (#396): where the course can be entered, the colon follows OBS; the six cells of the
// column leave no room for the degree sign then. No figure shows this case
describe('Super NAV 5 OBS field (characterization)', () => {
    it('characterization: shows OBS: and the course without a degree sign where the course can be entered (#396)', async () => {
        const {unit} = await enrouteObs(); // NO_OBS
        await vi.advanceTimersByTimeAsync(1000);

        expect(SuperNav5.read().left[5]).toBe('Ù:051');
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

    // A pilot reaches this state: the ADJ NAV IND CRS message of a driven indicator that does not follow is read and
    // Super NAV 5 shows, then a new message is posted whose condition lapses before it is read (the shape of
    // InsideAirspaceMessage). When the lapse falls between a flashing tick and the next display tick, the element that
    // flashed is the one that must turn steady; whether it does so depends on the timing, so the test calls the message
    // handler's tick itself, right after the flashing tick (the maintainer's ruling, #326). The fake sim does not slew
    // the indicator (applyObsKeyEvents)
    it('keeps msg steady when the unread message lapses after a flashing tick (3-16, 3-36, #326)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4, panelXml: panelXml({'Output.ObsTarget': 1})});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 12 s the indicator must be off
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS']); // Preconditions
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
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS']); // Precondition: only the read message is left
        await vi.advanceTimersByTimeAsync(TICK_TIME_DISPLAY);

        expect(mapPrompt()).toBe('msg III');
        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['msg III']));
    });

    // 3-16: a message whose condition needs action keeps the prompt on, not flashing, once it is read; 3-36 puts the same
    // prompt on the map. The condition is a driven indicator that does not follow, as in the status line test
    // (StatusLine.test.ts). The steady inverse once read is the maintainer's ruling (#326)
    it('keeps msg steady in inverse video once read while the condition stays (3-16, 3-36, #326)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4, panelXml: panelXml({'Output.ObsTarget': 1})});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 12 s the indicator must be off
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS']); // Preconditions
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        await showSuperNav5(unit);

        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['msg III']));
    });
});

// 4-8: at a waypoint with an anticipated turn the alert flashes the active waypoint, and the ident of Super NAV 5 stops
// flashing and goes steady when the turn starts (#437)
describe('Super NAV 5 active ident at a turn (4-8, #437)', () => {
    /** The aircraft 0.8 NM before ABC (inside the alert, before the turn) or 0.25 NM before it (in the turn) */
    async function nearAbc(nm: number): Promise<HeadlessUnit> {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 0});
        await moveAircraft(unit, pointBefore(kaaa, abc, nm), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        await showSuperNav5(unit);
        return unit;
    }

    it('flashes the active ident before the turn (4-8, #437)', async () => {
        const unit = await nearAbc(0.8);
        expect(unit.props.memory.navPage.waypointAlert).toBe(true); // Preconditions: the alert, no turn yet
        expect(turnStackLength(unit)).toBe(0);

        // The ident cell is blank on the one display tick in four that is the blink tick, on the same tick of both cycles
        const first = await blinkCycle(() => SuperNav5.read().left[1]);
        const second = await blinkCycle(() => SuperNav5.read().left[1]);
        expect(first.filter(r => r.trim() === 'ABC')).toHaveLength(3);
        expect(first.filter(r => r.trim() === '')).toHaveLength(1);
        expect(second.map(r => r.trim())).toEqual(first.map(r => r.trim()));
    });

    it('shows the active ident steady during the turn (4-8, #437)', async () => {
        const unit = await nearAbc(0.25);
        expect(unit.props.memory.navPage.waypointAlert).toBe(true); // Preconditions: the alert and a turn on the stack
        expect(turnStackLength(unit)).toBeGreaterThan(0);

        const reads = [...await blinkCycle(() => SuperNav5.read().left[1]), ...await blinkCycle(() => SuperNav5.read().left[1])];
        expect(reads.map(r => r.trim())).toEqual(Array(8).fill('ABC'));
    });
});
