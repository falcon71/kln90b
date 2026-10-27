import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {angleDiff, courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {savedFlightplan} from '../../harness/storage';
import {AIRDATA, APR_ARM_SWITCH, NO_ALTIMETER, panelXml, VFR_ONLY} from '../../harness/panelXml';
import {activeIdent, messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

describe('ALTITUDE FAIL', () => {
    // B-1: the message shows when the altitude input fails. Input.AltimeterInterfaced false is a unit without the input
    // (CLAUDE.md, public contract: the panel.xml keys)
    it('shows on a unit without an altitude input (B-1)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('ALTITUDE FAIL');
    });

    it('does not show on a unit with an altitude input (B-1)', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('ALTITUDE FAIL');
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    it('does not show on a VFR-only unit without an altitude input (characterization)', async () => {
        const unit = await bootUnit({panelXml: panelXml({...VFR_ONLY, ...NO_ALTIMETER})});
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('ALTITUDE FAIL');
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    it('does not show when an air data computer supplies the altitude (B-1)', async () => {
        const unit = await bootUnit({panelXml: panelXml({...NO_ALTIMETER, ...AIRDATA})});
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('ALTITUDE FAIL');
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });
});

describe('MAGNETIC VAR INVALID (5-44, B-2)', () => {
    // 5-44: the primary coverage area, with the magnetic variation of the data base, ends at N 74
    it('shows at N 74.5 (5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).toContain('MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH');
        // What the pilot sees: the message is the newest on the MSG page
        await unit.panel.msg();
        expect(Screen.read().row(0).trimEnd()).toBe('MAGNETIC VAR INVALID');
    });

    it('does not show at N 73.5 (5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: 73.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).not.toContain('MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH');
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });
});

describe('PRESS ALT TO SET BARO (6-8, B-3)', () => {
    async function armedAt29() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(messages(unit)).not.toContain('PRESS ALT TO SET BARO'); // Not before the arming
        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        return unit;
    }

    // 6-8: the unit arms within 30 NM and gives the message; the ALT page is where the baro is checked
    it('shows when the unit arms the approach (6-8, B-3)', async () => {
        const unit = await armedAt29();
        await vi.advanceTimersByTimeAsync(1000);

        expect(messages(unit)).toContain('PRESS ALT TO SET BARO');
    });

    it('goes once the ALT page has been shown (6-8, B-3)', async () => {
        const unit = await armedAt29();
        await vi.advanceTimersByTimeAsync(1000);
        expect(messages(unit)).toContain('PRESS ALT TO SET BARO'); // The precondition: it is there before the ALT page
        await unit.panel.alt();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('PRESS ALT TO SET BARO');
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG); // Still armed: the ALT page answered it
    });
});

const DB_TEXT = 'DATA BASE OUT OF DATE ALL DATA MUST BE CONFIRMED BEFORE USE';

/** How often the data base message is listed */
const dbCopies = (unit: HeadlessUnit) => messages(unit).filter(m => m === DB_TEXT).length;

/** How often the message is listed, at every display tick over two seconds */
async function countsOverTwoSeconds(unit: HeadlessUnit): Promise<number[]> {
    const counts: number[] = [];
    for (let i = 0; i < 8; i++) {
        counts.push(dbCopies(unit));
        await vi.advanceTimersByTimeAsync(250);
    }
    return counts;
}

/**
 * A unit whose GPS has no fix yet, so that the SET 2 date and time can be entered (3-53), with SET 2 shown and the
 * cursor on the date. A booted unit has a fix at once, and the date is read-only with a fix
 */
async function onSet2(start?: Date): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true, start});
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.cursor('L');
    return unit;
}

/** Enters a date on SET 2 (the steps of enterDate, as in Set2Page.test.ts), then ENT */
async function set2Date(unit: HeadlessUnit, day: number, month: number, year: [number, number], expected: string) {
    await unit.panel.cursorTo('L', Screen.read().rows('L')[2].trim());
    await unit.panel.enterDate('L', day, month, year);
    expect(Screen.read().rows('L')[2]).toBe(`  ${expected}`);
    await unit.panel.ent();
}

/** Enters 01 JAN 27 on SET 2, after the expiration of the data base */
async function outOfDateBySet2() {
    const unit = await onSet2();
    await set2Date(unit, 1, 1, [2, 7], '01 JAN 27');
    return unit;
}

describe('DATA BASE OUT OF DATE after a date entered on SET 2 (B-2)', () => {
    // The sibling of the pin: the message is posted and stays, unread
    it('posts the message and keeps it unread (B-2)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages(unit).filter(m => m === DB_TEXT)).toHaveLength(1);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);
    });

    // B-2 names one message. Before #175 the one-time message of Database.onGPSAcquired and the persistent
    // DatabaseOutOfDateMessage both fired, so for one calculation tick the MSG page listed it twice
    it('lists the message once (B-2) (#175)', async () => {
        const unit = await outOfDateBySet2();

        expect(Math.max(...await countsOverTwoSeconds(unit))).toBe(1);
    });
});

describe('DATA BASE OUT OF DATE after a date entered on the self-test page (B-2, 3-16)', () => {
    // B-2 lists the message after a date entered at the self-test. The self-test entry publishes no time update, so the
    // persistent message is the one source; 3-16 keeps a message until it is read. Before #175 it was gone a second later, unread
    it('posts the message and keeps it unread through the approval (B-2, 3-16)', async () => {
        const unit = await bootToSelfTest({storage: {fastGpsAcquisition: false}});
        await unit.panel.cursorTo('R', '01 JUN 26');
        await unit.panel.enterDate('R', 1, 1, [2, 7]);
        expect(Screen.read().text()).toContain('01 JAN 27'); // Precondition: the date as entered
        await unit.panel.ent();
        expect(await countsOverTwoSeconds(unit)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(5000);

        expect(dbCopies(unit)).toBe(1);
        expect(unit.props.messageHandler.getMessages().find(m => m.message.join(' ') === DB_TEXT)!.seen).toBe(false);
    });
});

// Checked in the KLN 89 trainer, 2026-10-18: a SET 2 date after the end of the data base made the message prompt flash
// and the message page list the message once; after it was read the prompt was gone and the page showed no message.
// With the date already after the end at power-up, and after a SET 2 date moved back into the period, no message
describe('DATA BASE OUT OF DATE (checked in the KLN 89 trainer, 2026-10-18)', () => {
    it('is listed once, and gone once it is read (checked in the KLN 89 trainer, 2026-10-18) (#175)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1);

        const read = await unit.panel.readMessages();
        await vi.advanceTimersByTimeAsync(3000);

        expect(read).toContain('DATA BASE OUT OF DATE'); // Precondition: the MSG page showed it
        expect(dbCopies(unit)).toBe(0);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        expect(unit.props.database.isAiracCurrent()).toBe(false); // The data base is still out of date
    });

    it('is not posted with the date already past the end at power-up, nor when SET 2 moves it back into the period (checked in the KLN 89 trainer, 2026-10-18)', async () => {
        const unit = await onSet2(new Date('2026-07-01T12:00:00Z'));
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.props.database.isAiracCurrent()).toBe(false); // Precondition: past the end from the start
        expect(dbCopies(unit)).toBe(0);

        await set2Date(unit, 1, 6, [2, 6], '01 JUN 26');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.database.isAiracCurrent()).toBe(true);
        expect(dbCopies(unit)).toBe(0);
    });
});

// The maintainer's ruling (#175): one copy on every path, and none when the validity of the data base did not change.
// Before the fix every SET 2 entry past the end added a copy
describe('DATA BASE OUT OF DATE, one copy (#175)', () => {
    // The maintainer's ruling (#176): the unit loses its messages at the power-off. The date is still past the end at
    // the power-on, where the KLN 89 check of 2026-10-18 showed no message; it did not try an unread message over the
    // power cycle, so the title cites the issues only
    it('is not listed again after a power cycle with the message unread (#175, #176)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1); // Precondition: listed, unread
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.database.isAiracCurrent()).toBe(false); // Precondition: still past the end
        expect(dbCopies(unit)).toBe(0);
    });

    it('lists one copy after a second SET 2 date past the end (#175)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1); // Precondition

        await set2Date(unit, 1, 2, [2, 7], '01 FEB 27');
        await vi.advanceTimersByTimeAsync(3000);

        expect(dbCopies(unit)).toBe(1);
    });

    it('lists none after SET 2 time entries while the date is already past the end (#175)', async () => {
        const unit = await onSet2(new Date('2026-07-01T12:00:00Z'));
        await vi.advanceTimersByTimeAsync(2000);
        for (let n = 0; n < 2; n++) {
            await unit.panel.cursorTo('L', Screen.read().rows('L')[3].slice(0, 5));
            await unit.panel.inner('L', 1); // Opens the entry on hour 00
            await unit.panel.ent();
            await vi.advanceTimersByTimeAsync(3000);
        }

        expect(unit.props.sensors.in.gps.timeZulu.getHours()).toBe(0); // Precondition: the entries were taken
        expect(dbCopies(unit)).toBe(0);
    });
});

// #401: the unit sends the new course of a leg to a driven indicator, the sim slews it with K:VOR1_SET and the unit reads
// it back one calculation tick later. The message is for an indicator that does not follow (B-1), and for a slew of a
// moment it must stay quiet. The fake sim applies K:VOR1_SET at once, so the read-back is the slew of the sim
describe('ADJ NAV IND CRS, a driven indicator slewed through a sequencing (#401)', () => {
    it('posts no ADJ NAV IND CRS while the unit slews a driven indicator through a sequencing (#401)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: pointBefore(kaaa, abc, 4),
            panelXml: panelXml({'Output.ObsTarget': 1}), storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        unit.env.sim.set('Nav OBS:1', 'degrees', 50);
        unit.env.sim.applyObsKeyEvents = true;
        await settle(unit);
        expect(activeIdent(unit)).toBe('ABC'); // Preconditions: on the first leg, a driven indicator
        expect(unit.props.planeSettings.output.obsTarget).toBe(1);

        // 240 kt, sampled every display tick: 4 NM to ABC and on, along ABC to KBBB, for about two minutes
        unit.env.sim.set('GROUND VELOCITY', 'knots', 240);
        const nmPerStep = 240 * 0.25 / 3600;
        const legBefore = finalCourseDeg(kaaa, abc);
        const legAfter = courseDeg(abc, kbbb);
        const sampled: string[] = [];
        const indicator = new Set<number>();
        let sequenced = false;
        for (let step = 1; step <= 480; step++) {
            const nm = step * nmPerStep;
            const to = nm <= 4 ? pointBefore(kaaa, abc, 4 - nm) : pointFrom(abc, legAfter, nm - 4);
            unit.env.sim.set('PLANE LATITUDE', 'degrees', to.lat);
            unit.env.sim.set('PLANE LONGITUDE', 'degrees', to.lon);
            await vi.advanceTimersByTimeAsync(250);
            sampled.push(...messages(unit));
            indicator.add(Math.round(unit.env.sim.get('Nav OBS:1', 'degrees')));
            sequenced = sequenced || activeIdent(unit) === 'KBBB';
        }

        expect(sequenced).toBe(true); // Precondition: the flight went through the sequencing at ABC
        // The unit slewed the indicator to the new course of the leg after ABC (the magnetic variation is 0)
        const slewedTo = (course: number) => [...indicator].some(v => Math.abs(angleDiff(v, course)) <= 1);
        expect(slewedTo(legBefore)).toBe(true);
        expect(slewedTo(legAfter)).toBe(true);
        expect(sampled.filter(m => m.includes('ADJ NAV IND CRS'))).toEqual([]);
    });
});
