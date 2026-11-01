import {describe, expect, it, vi} from 'vitest';
import {ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {Leg, star, withProcedures} from '../../../harness/navdata/procedures';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {fplIdents} from '../../../harness/readers';
import {EVT_ALT, EVT_CLR, EVT_ENT, EVT_L_INNER_RIGHT, EVT_POWER_OFF} from '../../../../kln90b/HEvents';
import {MainPage} from '../../../../kln90b/pages/MainPage';

// 4-2..4-3, figure 4-7a: a SID/STAR waypoint that is flown over, entered into a flight plan, brings up the waypoint type
// page after its approval: EN ROUTE keeps the turn anticipation, SID/STAR turns it off at that waypoint. Which entered
// fix counts as such a waypoint is the maintainer's rule (a terminal fix flown over by a SID or STAR of its airport), and
// the CLR, the double ENT and the copy into FPL 0 are our own choices (design doc of #77), so those are characterizations.
const kaaaBase = airport('KAAA', 47, 8);
const df1 = intersection('DF1', 47.1, 8.1, {airport: 'KAAA'});
const df4 = intersection('DF4', 47.1, 8.2, {airport: 'KAAA'});
const fx1 = intersection('FX1AA', 46.8, 8.0);
const fx2 = intersection('FX2AA', 46.9, 8.0);
// The STAR flies over DF1 and through DF4
const kaaa = withProcedures(kaaaBase, {arrivals: [star('ARR1', {common: [Leg.TF(df1, 0, true), Leg.TF(df4)]})]});
const FACILITIES = [kaaa, df1, df4, fx1, fx2];
const POSITION = {lat: 46.5, lon: 8};

const v2 = (...fixes: { icaoStruct: Parameters<typeof ICAO.valueToStringV2>[0] }[]) =>
    fixes.map(f => ICAO.valueToStringV2(f.icaoStruct)).join('');

/** Whether each leg of a flight plan is a fly-over */
const flags = (unit: HeadlessUnit, idx: number) =>
    unit.props.memory.fplPage.flightplans[idx].getLegs().map(l => l.flyOver === true);

async function bootFpl4(legs = [fx1], storage: Record<string, unknown> = savedFlightplan(4, legs), facilities = FACILITIES): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: POSITION, storage});
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 4');
    await unit.panel.cursor('L');
    return unit;
}

/** FPL 4 holds FX1AA; the ident goes into the blank position at the end and its waypoint page shows on the right */
async function typeAtEnd(ident: string): Promise<HeadlessUnit> {
    const unit = await bootFpl4();
    await unit.panel.outer('L', 3); // USE?, USE? INVRT?, FX1AA, the blank position
    expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '}); // Precondition
    await unit.panel.enterIdent('L', ident);
    await unit.panel.ent(); // the waypoint page
    return unit;
}

/** The approval ENT of the waypoint page on the right */
async function typeAndApprove(ident: string): Promise<HeadlessUnit> {
    const unit = await typeAtEnd(ident);
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(500);
    return unit;
}

describe('waypoint type page (4-2..4-3, figure 4-7a)', () => {
    it('asks how DF1 is used after its approval (4-2..4-3, figure 4-7a)', async () => {
        const unit = await typeAndApprove('DF1');

        expect(Screen.read().rows('L')).toEqual(['DF1        ', '  TYPE WPT ', '           ', '1 EN ROUTE?', '2 SID/STAR?', '           ']);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 0, text: '1 EN ROUTE?'});
        // The cursor stays on, so the status line shows CRSR; the blank name is our choice (design doc of #77) and would
        // show in its place
        expect(Screen.read().status().left).toBe('CRSR');
        expect((unit.props.pageManager.getCurrentPage() as MainPage).leftPageName()).toBe('     ');
        expect(fplIdents(unit, 4)).toEqual(['FX1AA']); // nothing inserted yet
        expect(unit.errors).toEqual([]);
    });

    // 4-3: the SID/STAR answer makes DF1 a fly-over waypoint, the turn anticipation is off there
    it('marks DF1 as a fly-over on SID/STAR? (4-3)', async () => {
        const unit = await typeAndApprove('DF1');
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L').text).toBe('2 SID/STAR?');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 4)).toEqual([false, true]);
        expect(unit.errors).toEqual([]);
    });

    // 4-3: the EN ROUTE answer inserts DF1 as any other waypoint, with turn anticipation
    it('inserts DF1 en route on EN ROUTE? (4-3)', async () => {
        const unit = await typeAndApprove('DF1');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 4)).toEqual([false, false]);
    });
});

describe('waypoint type page (characterization)', () => {
    // The design of #77: an en route waypoint with a flag, so it keeps the en route separator, and the flag is stored as
    // the trailer of the V2 string. The cursor moves on to the next position as after any approval
    it('shows DF1 en route, moves the cursor on and stores the mark after SID/STAR? (characterization)', async () => {
        const unit = await typeAndApprove('DF1');
        await unit.panel.outer('L', 1);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('L')[2]).toBe('  2:DF1    ');
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '     '});
        // Two legs, the second flagged: '02' and the bitset 0b10, which is 'C' in base64
        expect(storedSetting(unit, 'fpl4')).toBe(v2(fx1, df1) + '02C');
    });

    it('shows DF1 en route, moves the cursor on and stores no trailer after EN ROUTE? (characterization)', async () => {
        const unit = await typeAndApprove('DF1');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('L')[2]).toBe('  2:DF1    ');
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '     '});
        expect(storedSetting(unit, 'fpl4')).toBe(v2(fx1, df1));
    });

    it('asks nothing for DF4, which the STAR flies as an ordinary fix (characterization)', async () => {
        const unit = await typeAndApprove('DF4');

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF4']);
        expect(flags(unit, 4)).toEqual([false, false]);
        expect(Screen.read().rows('L')[2]).toBe('  2:DF4    ');
    });

    // As CLR on the approval itself (4-2 step 7): the waypoint page goes and the position is blank again
    it('inserts nothing on CLR and shows the plan again (characterization, as 4-2 step 7)', async () => {
        const unit = await typeAndApprove('DF1');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA']);
        expect(Screen.read().rows('L')).toEqual(['USE? INVRT?', '  1:FX1AA  ', '  2:       ', '           ', '           ', '           ']);
        expect(Screen.read().status().right).not.toBe('INT'); // the waypoint page of DF1 is gone
        expect(unit.errors).toEqual([]);
    });

    // The two approval ENTs go out back to back, so the second one arrives while the airport of DF1 is still loading
    it('shows the question once and inserts once on two quick ENTs (characterization)', async () => {
        const unit = await typeAtEnd('DF1');

        unit.send(EVT_ENT);
        unit.send(EVT_ENT);
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')[1]).toBe('  TYPE WPT '); // Precondition: the question
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(Screen.read().rows('L')[2]).toBe('  2:DF1    '); // the plan, no second question
        expect(unit.errors).toEqual([]);
    });

    it('inserts nothing when CLR follows the approval while the airport is loading (characterization)', async () => {
        const unit = await typeAtEnd('DF1');

        unit.send(EVT_ENT);
        unit.send(EVT_CLR);
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().rows('L')).toEqual(['USE? INVRT?', '  1:FX1AA  ', '  2:       ', '           ', '           ', '           ']);
        expect(fplIdents(unit, 4)).toEqual(['FX1AA']);
        // The blank still waits for its ENT, as after CLR on the approval itself (4-2 step 7): the knob keeps the cursor
        await unit.panel.outer('L', -1);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '});
        expect(unit.errors).toEqual([]);
    });

    it('approves nothing when the inner knob follows the approval while the airport is loading (characterization)', async () => {
        const unit = await bootFpl4();
        const rightBefore = Screen.read().rows('R'); // the page the waypoint page of DF1 covers
        await unit.panel.outer('L', 3); // the blank position
        await unit.panel.enterIdent('L', 'DF1');
        await unit.panel.ent(); // the waypoint page
        expect(Screen.read().status().right).toBe('INT'); // Precondition

        unit.send(EVT_ENT);
        unit.send(EVT_L_INNER_RIGHT);
        await vi.advanceTimersByTimeAsync(500);

        // The knob reopens the ident with an A, as during any approval; the waypoint page goes and no approval, question
        // or creation follows
        expect(Screen.read().rows('L')[2]).toBe('  2:A      ');
        expect(Screen.read().rows('R')).toEqual(rightBefore);
        expect(fplIdents(unit, 4)).toEqual(['FX1AA']);
        expect(unit.errors).toEqual([]);
    });

    it('asks again for the next ident after the inner knob ended an approval while the airport was loading (characterization)', async () => {
        const unit = await typeAtEnd('DF1');
        unit.send(EVT_ENT);
        unit.send(EVT_L_INNER_RIGHT);
        await vi.advanceTimersByTimeAsync(500);

        await unit.panel.enterIdent('L', 'FX2AA');
        await unit.panel.ent(); // the waypoint page
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX2AA']);
        expect(unit.errors).toEqual([]);
    });

    it('shows no error when the unit is turned off while the airport is loading (characterization)', async () => {
        const unit = await typeAtEnd('DF1');

        unit.send(EVT_ENT);
        unit.send(EVT_POWER_OFF);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit, 4)).toEqual(['FX1AA']);
    });

    // ALT pushes its page over the flight plan page while the airport loads. The question is not put over it; the approval
    // still waits on the waypoint page and asks once the plan shows again
    it('asks nothing over the ALT page pressed while the airport is loading, and asks at the next approval (characterization)', async () => {
        const unit = await typeAtEnd('DF1');

        unit.send(EVT_ENT);
        unit.send(EVT_ALT);
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')[0]).toBe(' ALTITUDE  ');
        unit.send(EVT_ALT); // closes the ALT page
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')).toEqual(['USE? INVRT?', '  1:FX1AA  ', '  2:DF1    ', '           ', '           ', '           ']);
        expect(Screen.read().status().right).toBe('INT'); // the waypoint page of DF1
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().rows('L')[1]).toBe('  TYPE WPT ');
        expect(fplIdents(unit, 4)).toEqual(['FX1AA']);
        expect(unit.errors).toEqual([]);
    });

    // ENT on the blank position takes the waypoint of the INT page on the right (the alternate entry); the design of #77
    // has its approval ask as a typed ident's does
    it('asks for the waypoint of the INT page taken with ENT (characterization)', async () => {
        const unit = await bootFpl4();
        await unit.panel.cursor('L');
        await unit.panel.selectPage('R', 'INT');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'DF1');
        await unit.panel.cursor('R');
        expect(Screen.read().rows('R')[0].trim().startsWith('DF1')).toBe(true); // Precondition: the INT page of DF1
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // the blank position
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '}); // Precondition

        await unit.panel.ent(); // takes DF1, its waypoint page
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')[1]).toBe('  TYPE WPT ');
        await unit.panel.outer('L', 1);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 4)).toEqual([false, true]);
    });

    // Without the cursor, ENT would go to the waypoint page on the right and approve DF1 without an answer
    it('keeps the cursor on the question when CRSR is pressed (characterization)', async () => {
        const unit = await typeAndApprove('DF1');

        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 3, col: 0, text: '1 EN ROUTE?'});
        await unit.panel.outer('L', 1);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 4)).toEqual([false, true]);
    });

    // A numbered plan of 30 waypoints refuses another with FPL FULL, and the cursor stays on the waypoint the insert was in
    // front of, as FplPage.test.ts holds (#240). DF1 is refused after its answer, DF4 at its approval; both end the same
    for (const [ident, answered] of [['DF1', true], ['DF4', false]] as const) {
        it(`refuses ${ident} in a full plan with FPL FULL and keeps the cursor on FL01 (characterization, #240)`, async () => {
            const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.0, 7.0 + 0.02 * i));
            const unit = await bootFpl4(fillers, savedFlightplan(4, fillers), [...FACILITIES, ...fillers]);
            await unit.panel.outer('L', 3); // USE?, USE? INVRT?, FL00, FL01
            expect(unit.panel.focused('L').text).toBe('FL01 '); // Precondition
            await unit.panel.inner('L', 1); // the insert in front of FL01
            await unit.panel.enterIdent('L', ident);
            await unit.panel.ent(); // the waypoint page
            await unit.panel.ent();
            await vi.advanceTimersByTimeAsync(500);
            if (answered) {
                expect(Screen.read().rows('L')[1]).toBe('  TYPE WPT '); // Precondition: the question
                await unit.panel.ent(); // EN ROUTE?
            }

            expect(Screen.read().status().mode).toBe('FPL FULL');
            expect(fplIdents(unit, 4)).toEqual(fillers.map(f => f.icaoStruct.ident));
            expect(unit.panel.focused('L').text).toBe('FL01 ');
            expect(unit.errors).toEqual([]);
        });
    }

    it('marks only the inserted waypoint when DF1 goes in front of FX2AA (characterization)', async () => {
        const unit = await bootFpl4([fx1, fx2]);
        await unit.panel.outer('L', 3); // USE?, USE? INVRT?, FX1AA, FX2AA
        expect(unit.panel.focused('L').text).toBe('FX2AA'); // Precondition
        await unit.panel.inner('L', 1); // the insert in front of FX2AA
        await unit.panel.enterIdent('L', 'DF1');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        await unit.panel.outer('L', 1);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1', 'FX2AA']);
        expect(flags(unit, 4)).toEqual([false, true, false]);
    });

    it('keeps the mark when the plan is copied into FPL 0 with USE? (characterization)', async () => {
        const unit = await typeAndApprove('DF1');
        await unit.panel.outer('L', 1);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        await unit.panel.cursorToTop('L');
        expect(unit.panel.focused('L').text).toBe('USE?'); // Precondition

        await unit.panel.ent();

        expect(fplIdents(unit, 0)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 0)).toEqual([false, true]);
    });

    it('restores the mark at power-on (characterization)', async () => {
        const unit = await bootFpl4([], {userDataFormat: 2, fpl4: v2(fx1, df1) + '02C'});

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']);
        expect(flags(unit, 4)).toEqual([false, true]);
    });
});
