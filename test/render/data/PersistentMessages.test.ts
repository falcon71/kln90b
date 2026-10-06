import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

/** The messages the MSG page would list, one string per message */
const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

const panelXml = (input: string) =>
    `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>${input}</Input></Instrument></PlaneHTMLConfig>`;

describe('ALTITUDE FAIL', () => {
    // B-1: the message shows when the altitude input fails. Input.AltimeterInterfaced false is a unit without the input
    // (CLAUDE.md, public contract: the panel.xml keys)
    it('shows on a unit without an altitude input (B-1)', async () => {
        const unit = await bootUnit({panelXml: panelXml('<AltimeterInterfaced>false</AltimeterInterfaced>')});
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('ALTITUDE FAIL');
    });

    it('does not show on a unit with an altitude input (B-1)', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(2000);

        // The two messages of every engine-running boot (docs/testing.md, section 6), and nothing else
        expect(messages(unit).sort()).toEqual([
            'POSITION DIFFERS FROM LAST POSITION BY >2NM',
            'SYSTEM TIME UPDATED TO GPS TIME',
        ]);
    });

    it('does not show on a VFR-only unit without an altitude input (characterization)', async () => {
        const unit = await bootUnit({
            panelXml: '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><VFROnly>true</VFROnly><Input><AltimeterInterfaced>false</AltimeterInterfaced></Input></Instrument></PlaneHTMLConfig>',
        });
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('ALTITUDE FAIL');
        expect(messages(unit)).toContain('SYSTEM TIME UPDATED TO GPS TIME'); // The list is the live one
    });

    it('does not show when an air data computer supplies the altitude (B-1)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml('<AltimeterInterfaced>false</AltimeterInterfaced><Airdata><IsInterfaced>true</IsInterfaced></Airdata>'),
        });
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('ALTITUDE FAIL');
        expect(messages(unit)).toContain('SYSTEM TIME UPDATED TO GPS TIME'); // The list is the live one
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
        expect(messages(unit)).toContain('SYSTEM TIME UPDATED TO GPS TIME');
    });
});

describe('PRESS ALT TO SET BARO (6-8, B-3)', () => {
    async function armedAt29() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
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

describe('DATA BASE OUT OF DATE after a date entered on SET 2 (B-2)', () => {
    /** Enters 01 JAN 27 on SET 2, after the expiration of the data base (the steps of Set2Page.test.ts) */
    async function outOfDateBySet2() {
        // A booted unit has a fix at once, and the date is read-only with a fix
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // JAN
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // the first click enters a 0, so this is a 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        expect(Screen.read().rows('L')[2]).toBe('  01 JAN 27');
        await unit.panel.ent();
        return unit;
    }

    const DB_TEXT = 'DATA BASE OUT OF DATE ALL DATA MUST BE CONFIRMED BEFORE USE';

    /** How often the message is listed, at every display tick over two seconds */
    async function countsOverTwoSeconds(unit: HeadlessUnit): Promise<number[]> {
        const counts: number[] = [];
        for (let i = 0; i < 8; i++) {
            counts.push(messages(unit).filter(m => m === DB_TEXT).length);
            await vi.advanceTimersByTimeAsync(250);
        }
        return counts;
    }

    // The sibling of the pin: the message is posted and stays, unread
    it('posts the message and keeps it unread (B-2)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages(unit).filter(m => m === DB_TEXT)).toHaveLength(1);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);
    });

    // B-2 names one message. The one-time message of Database.onGPSAcquired and the persistent DatabaseOutOfDateMessage
    // both fire, so for one calculation tick the MSG page lists it twice
    it.fails('lists the message once (B-2) (#NEW-3-2)', async () => {
        const unit = await outOfDateBySet2();

        expect(Math.max(...await countsOverTwoSeconds(unit))).toBe(1);
    });
});
