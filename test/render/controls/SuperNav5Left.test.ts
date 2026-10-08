import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
import {blinkCycle} from '../../harness/render/blink';
import {readRows} from '../../harness/render/screen';
import {SuperNav5} from '../../harness/render/superNav5';
import {savedFlightplan} from '../../harness/storage';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';

/**
 * The mode glyphs of the KLN font (kln90b.ttf), read by drawing each code point: Ê is ENR, Ë is LEG, Í is ARM and Ì is
 * APR, each in one cell. So 'Ê-Ë' reads ENR-LEG.
 */
const ENR = 'Ê', LEG = 'Ë', ARM = 'Í', APR = 'Ì';

const OBS_SOURCE_OFF =
    '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';

/** NAV 5 on both sides. The right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5 */
async function showSuperNav5(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);
}

/** The approach of approachWorld() loaded, the aircraft 2.5 NM before the FAF and armed (6-3) */
async function armed(panelXml?: string): Promise<{ unit: HeadlessUnit, w: ReturnType<typeof approachWorld> }> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(7.5), panelXml,
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    await vi.advanceTimersByTimeAsync(31_000);
    return {unit, w};
}

/** The text and the mask of the message prompt over the map (3-36) over 8 display ticks (two blink cycles) */
async function mapPromptOverTwoSeconds(): Promise<Set<string>> {
    const prompt = () => {
        const row = readRows(document.querySelector('#pageContainer .super-nav5-mgs-range')!)[0];
        return `${row.map(c => c.ch).join('')} ${row.map(c => c.attr).join('')}`;
    };
    return new Set([...await blinkCycle(prompt), ...await blinkCycle(prompt)]);
}

/** Super NAV 5 on the standard route in the enroute OBS mode (OBS selected on the first leg, no external OBS input) */
async function enrouteObs(): Promise<{ unit: HeadlessUnit, dtk: number }> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]), panelXml: OBS_SOURCE_OFF,
    });
    await settle(unit);
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
    // variation 0; without an OBS input the course is the DTK at the moment OBS is selected (5-36)
    it('shows ARM: and the OBS course in the approach-arm OBS mode (5-32)', async () => {
        const {unit} = await armed(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}:180`);
    });

    // 5-32: the preconditions of the pin below, ENR and the course 050
    it('shows ENR and the OBS course in the enroute OBS mode (sibling of #NEW-6-2) (5-32)', async () => {
        const {unit, dtk} = await enrouteObs();

        expect(dtk).toBe(50); // the DTK of the active leg to ABC, so the course OBS takes; from the geometry
        const mode = SuperNav5.read().left[2];
        expect(mode.startsWith(ENR)).toBe(true);
        expect(mode.endsWith('050')).toBe(true);
    });

    // 5-32: ENR:274, the colon between the mode and the course, as ARM:259 has it (and the code has it for ARM)
    it.fails('shows ENR: and the OBS course in the enroute OBS mode (5-32, #NEW-6-2)', async () => {
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

        expect(await mapPromptOverTwoSeconds()).toEqual(new Set(['msg III', 'msg FFF']));
    });

    it('shows three blanks without a message (3-36)', async () => {
        const unit = await bootUnit();
        await unit.panel.msg();
        await unit.panel.msg(); // the two boot messages fit one MSG page; the second press closes it
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.messageHandler.hasMessages()).toBe(false); // the precondition
        await showSuperNav5(unit);

        expect(await mapPromptOverTwoSeconds()).toEqual(new Set(['    ...']));
    });
});
