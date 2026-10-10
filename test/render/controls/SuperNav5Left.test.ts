import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
import {blinkCycle} from '../../harness/render/blink';
import {readRows} from '../../harness/render/screen';
import {showSuperNav5, SuperNav5} from '../../harness/render/superNav5';
import {savedFlightplan} from '../../harness/storage';
import {NO_OBS, panelXml} from '../../harness/panelXml';
import {bootOnStandardRoute} from '../../harness/worldBoot';

/**
 * The mode glyphs of the KLN font (kln90b.ttf), read by drawing each code point: Ê is ENR, Ë is LEG, Í is ARM and Ì is
 * APR, each in one cell. So 'Ê-Ë' reads ENR-LEG.
 */
const ENR = 'Ê', LEG = 'Ë', ARM = 'Í', APR = 'Ì';

/** The approach of approachWorld() loaded, the aircraft 2.5 NM before the FAF and armed (6-3) */
async function armed(xml?: string): Promise<{ unit: HeadlessUnit, w: ReturnType<typeof approachWorld> }> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(7.5), panelXml: xml,
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
async function enrouteObs(): Promise<{ unit: HeadlessUnit, dtk: number }> {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: panelXml(NO_OBS)});
    await unit.panel.obsMode();
    await showSuperNav5(unit);
    return {unit, dtk: Math.round(courseDeg(kaaa, abc))};
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
        const {unit} = await armed(panelXml(NO_OBS));
        await unit.panel.obsMode();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}:180`);
    });

    // 5-32: the preconditions of the pin below, ENR and the course 050
    it('shows ENR and the OBS course in the enroute OBS mode (sibling of #321) (5-32)', async () => {
        const {unit, dtk} = await enrouteObs();

        // The DTK of the active leg to ABC, from the geometry. The aircraft is on the leg's course (the deviation stays
        // unchanged, 5-36), so OBS takes that course
        expect(dtk).toBe(50);
        const mode = SuperNav5.read().left[2];
        expect(mode.startsWith(ENR)).toBe(true);
        expect(mode.endsWith('050')).toBe(true);
    });

    // 5-32: ENR:274, the colon between the mode and the course, as ARM:259 has it (and the code has it for ARM)
    it.fails('shows ENR: and the OBS course in the enroute OBS mode (5-32, #321)', async () => {
        const {unit} = await enrouteObs();

        expect(SuperNav5.read().left[2]).toBe(`${ENR}:050`);
    });
});

// 3-36: on Super NAV 5 the message prompt sits in the lower left corner of the map; 3-16: it flashes in inverse video
// while a message is new
describe('Super NAV 5 message prompt (3-16, 3-36)', () => {
    it('flashes msg in inverse video while a message is unread (3-16, 3-36)', async () => {
        const unit = await bootUnit(); // the boot messages are unread (testing.md section 6)
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
});
