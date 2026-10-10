import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, MINIMAL_PANEL_XML, moveAircraft, settle} from '../../../harness/boot';
import {blinkCycle} from '../../../harness/render/blink';
import {legWorld} from '../../../harness/fixtures';
import {NO_OBS, panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

// ObsDtkElement: the DTK of NAV 3 (and of the sixth line of Super NAV 5), which becomes the OBS course in OBS mode and
// can then be entered with the inner knob, one degree per click, when no external indicator supplies the course.
// Host: NAV 3 on the left, row 1 (DTK or OBS, value in columns 7 to 10). The committed value is the navPage memory
// obsMag. Nav3Page.test.ts holds the OBS: colon and the course entry of 5-35; SuperNav5Page.test.ts holds the Super
// NAV 5 course entry and its pin #238.

// The leg world: FPL 0 is KAAA, KDDD, KEEE, and the aircraft is on the leg 30 NM west of KDDD, track 090, DTK 089 there
const OBS_SOURCE_OFF = panelXml(NO_OBS);

async function nav3(xml: string): Promise<HeadlessUnit> {
    const {kaaa, kddd, keee, west} = legWorld();
    const unit = await bootUnit({
        facilities: [kaaa, kddd, keee], position: west(30), panelXml: xml, storage: savedFlightplan(0, [kaaa, kddd, keee]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 3');
    await moveAircraft(unit, west(30), {groundspeedKt: 120, trackTrue: 90});
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

/** The attributes of the DTK value cells on four display ticks (one blink cycle), as a set */
async function dtkMasks(): Promise<Set<string>> {
    return new Set(await blinkCycle(() => Screen.read().maskRows('L')[1].slice(7, 11)));
}

describe('OBS/DTK element', () => {
    // 5-35 note: in Leg mode the course is not entered on the unit; NAV 3 then has no field, and the cursor button has
    // no effect (3-11)
    it('takes no cursor in Leg mode (3-11, 5-35)', async () => {
        const unit = await nav3(OBS_SOURCE_OFF);
        expect(Screen.read().rows('L')[1]).toBe('DTK    089°');
        await unit.panel.cursor('L');

        expect(Screen.read().status().left).toBe('NAV 3');
        expect(Screen.read().maskRows('L')[1]).toBe('...........');
    });

    // Checked in the KLN 89 trainer, 2026-10-07 (recorded in #263): one degree per click, and the course wraps between
    // 000 and 359 as on a compass card: 089 turned down 90 clicks is 359, and two clicks up from there 001
    it('turns the OBS course across north: 089 down 90 is 359, up 2 is 001 '
        + '(checked in the KLN 89 trainer, 2026-10-07, #263)', async () => {
        const unit = await nav3(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        await unit.panel.cursor('L');
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 7, text: '089°'});

        await unit.panel.inner('L', -90);
        expect(unit.panel.focused('L').text).toBe('359°');
        await unit.panel.inner('L', 2);
        expect(unit.panel.focused('L').text).toBe('001°');
    });

    // 4-9: with an external indicator whose selected course differs from the DTK by more than 10 degrees, the DTK on
    // NAV 3 flashes. The indicator at 100, the DTK 089: 11 degrees apart.
    it('flashes the DTK when the external course is 11 degrees off (4-9)', async () => {
        const unit = await nav3(MINIMAL_PANEL_XML);
        unit.env.sim.set('Nav OBS:1', 'degrees', 100);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1].slice(7)).toBe('089°');
        expect(await dtkMasks()).toEqual(new Set(['....', 'BBBB']));
    });

    // 4-9: within 10 degrees the DTK does not flash: the indicator at 095 and at 099, six and nine and a half degrees
    // from the DTK (089.46)
    it.each([95, 99])('does not flash the DTK at an external course of %d, within 10 degrees (4-9)', async (course) => {
        const unit = await nav3(MINIMAL_PANEL_XML);
        unit.env.sim.set('Nav OBS:1', 'degrees', course);
        await vi.advanceTimersByTimeAsync(1000);

        expect(await dtkMasks()).toEqual(new Set(['....']));
    });
});
