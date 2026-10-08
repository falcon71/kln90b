import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {savedUserWaypoints, storedSetting} from '../../harness/storage';

// WaypointDeleteListItem (kln90b/controls/WaypointDeleteListItem.tsx) is the row of OTH 3: CLR asks DEL <ident> ? and
// shows the waypoint's page on the right, ENT deletes the user waypoint, CLR again withdraws the question. The refusals
// (USED IN FPL, ACTIVE WPT) are held by test/render/pages/left/Oth3Page.test.ts

/** OTH 3 on the left with the user intersections AAA, BBB and CCC; the right side shows the SUP page of the boot */
async function oth3(): Promise<HeadlessUnit> {
    const waypoints = ['AAA', 'BBB', 'CCC'].map(ident => ({kind: 'int' as const, ident, lat: 47.5, lon: 8.25}));
    const unit = await bootUnit({storage: savedUserWaypoints(waypoints)});
    await unit.panel.selectPage('L', 'OTH 3');
    expect(Screen.read().status().right).toBe('SUP'); // Precondition: the page the right side returns to
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 1); // BBB
    return unit;
}

const userIdents = (unit: HeadlessUnit): string[] => {
    const idents: string[] = [];
    unit.props.facilityRepository.forEach(f => idents.push(f.icaoStruct.ident));
    return idents.sort();
};

/** The saved user waypoint slots wpt0 to wpt2: the ident of each, or the empty slot */
const savedIdents = (unit: HeadlessUnit): string[] =>
    [0, 1, 2].map(i => String(storedSetting(unit, `wpt${i}`)).slice(11, 16).trim());

describe('WaypointDeleteListItem on OTH 3 (5-20)', () => {
    // 5-20 steps 3 and 4: CLR shows the page of the waypoint to be deleted on the right, ENT deletes it. The unit saves
    // the user waypoints (CLAUDE.md, persisted user data), so the deleted one is gone from the saved slots too
    it('deletes the user waypoint under the cursor with CLR and ENT, and from the saved user data (5-20)', async () => {
        const unit = await oth3();
        await unit.panel.clr();
        expect(Screen.read().rows('L')[2]).toBe('DEL BBB   ?'); // Precondition: the question
        expect(Screen.read().rows('R')[0].trim()).toBe('BBB'); // Precondition: the waypoint's page on the right

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000); // the unit saves a moment after the change

        expect(userIdents(unit)).toEqual(['AAA', 'CCC']);
        expect(Screen.read().rows('L').slice(1, 4).map(r => r.slice(0, 3))).toEqual(['AAA', 'CCC', '   ']);
        expect(savedIdents(unit)).toEqual(['AAA', 'CCC', '']);
    });

    // After ENT the question is answered and the waypoint no longer exists, so its page leaves the right side, which
    // shows the page it showed before, as it does when the question is withdrawn (below) and as the right side does
    // after a waypoint page was approved (3-14). The unit keeps showing the deleted waypoint's page
    it.fails('shows the right page of before the question again once the waypoint is deleted (5-20, 3-14, #316)',
        async () => {
            const unit = await oth3();
            await unit.panel.clr();

            await unit.panel.ent();

            expect(userIdents(unit)).toEqual(['AAA', 'CCC']);
            expect(Screen.read().status().right).toBe('SUP');
        });
});

describe('WaypointDeleteListItem on OTH 3, the DEL question', () => {
    // Trainer T22 a (the 89's user waypoint list, OTH 4 there): CLR again withdrew the question, the waypoint stayed
    // and the cursor was on it
    it('a second CLR withdraws the question, keeps the waypoint and keeps the cursor on it ' +
        '(checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await oth3();
            await unit.panel.clr();
            expect(unit.panel.focused('L').text).toBe('DEL BBB   ?'); // Precondition

            await unit.panel.clr();

            expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: 'BBB   I    '});
            await unit.panel.ent(); // ENT no longer deletes
            expect(userIdents(unit)).toEqual(['AAA', 'BBB', 'CCC']);
        });

    // Trainer T22 c: the inner knob, one click each way, was ignored: the question stayed
    it('ignores the inner knob, the question and the cursor stay (checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await oth3();
            await unit.panel.clr();
            expect(unit.panel.focused('L').text).toBe('DEL BBB   ?'); // Precondition

            await unit.panel.inner('L', 1);
            await unit.panel.inner('L', -1);

            expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: 'DEL BBB   ?'});
            expect(userIdents(unit)).toEqual(['AAA', 'BBB', 'CCC']);
        });

    // The sibling of the pin below: the question holds the cursor, and the waypoint's page is on the right (5-20)
    it('asks DEL BBB ? on CLR, the waypoint stays until ENT and its page shows on the right (5-20)', async () => {
        const unit = await oth3();

        await unit.panel.clr();

        expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: 'DEL BBB   ?'});
        expect(Screen.read().status().right).toBe('INT');
        expect(userIdents(unit)).toEqual(['AAA', 'BBB', 'CCC']);
    });

    // The outer knob on the question withdraws it and the cursor moves on (trainer T22 b, checked in the KLN 89
    // trainer, 2026-10-08: the question went and the cursor moved to the entry above). T22 b did not record the
    // direction of the turn; a counterclockwise click is the one that moves up (T21 a: clockwise moved on). The unit
    // ignores the knob and keeps the question
    it.fails('drops the question and moves the cursor on when the outer knob turns ' +
        '(checked in the KLN 89 trainer, 2026-10-08, #317)',
        async () => {
            const unit = await oth3();
            await unit.panel.clr();

            await unit.panel.outer('L', -1);

            expect(unit.panel.focused('L')).toEqual({row: 1, col: 0, text: 'AAA   I    '});
            expect(Screen.read().rows('L')[2]).toBe('BBB   I    ');
            expect(userIdents(unit)).toEqual(['AAA', 'BBB', 'CCC']);
        });
});

describe('WaypointDeleteListItem on OTH 3 (characterization)', () => {
    it('characterization: a second CLR gives the right side back the page it showed before the question', async () => {
        const unit = await oth3();
        await unit.panel.clr();
        expect(Screen.read().status().right).toBe('INT'); // Precondition: the waypoint's page

        await unit.panel.clr();

        expect(Screen.read().status().right).toBe('SUP');
    });

    it('characterization: turning the cursor off withdraws the question, keeps the waypoint and gives the right side ' +
        'back',
        async () => {
            const unit = await oth3();
            await unit.panel.clr();
            expect(Screen.read().status().right).toBe('INT'); // Precondition: the waypoint's page

            await unit.panel.cursor('L');

            expect(Screen.read().rows('L')[2]).toBe('BBB   I    ');
            expect(Screen.read().status()).toMatchObject({left: 'OTH 3', right: 'SUP'});
            expect(userIdents(unit)).toEqual(['AAA', 'BBB', 'CCC']);
        });
});
