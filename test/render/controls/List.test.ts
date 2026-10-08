import {describe, expect, it} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {blinkCycle} from '../../harness/render/blink';
import {savedUserWaypoints} from '../../harness/storage';
import {approachWorld} from '../../harness/fixtures';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';

// List (kln90b/controls/List.tsx) shows its items in a fixed number of rows and scrolls to keep the item under the
// cursor in view; SimpleListItem (ListItem.tsx) is the row of OTH 4 and DUPLICATE WAYPOINT. The hosts are OTH 4 (a
// five-row list of airports with remarks) and OTH 3 (a five-row list of user waypoints, whose rows are
// WaypointDeleteListItem, tested in WaypointDeleteListItem.test.ts)

const REMARK: [string, string, string] = ['FUEL 24H   ', '           ', '           '];

/** OTH 4 on the left with remarks for the given airports, saved in this order */
async function oth4(idents: string[]): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    for (const ident of idents) {
        unit.props.remarksManager.saveRemarks(ident, REMARK);
    }
    await unit.panel.selectPage('L', 'OTH 4');
    return unit;
}

/** OTH 3 on the left with user intersections of the given idents; where they lie does not matter to the list */
async function oth3(idents: string[]): Promise<HeadlessUnit> {
    const waypoints = idents.map(ident => ({kind: 'int' as const, ident, lat: 47.5, lon: 8.25}));
    const unit = await bootUnit({storage: savedUserWaypoints(waypoints)});
    await unit.panel.selectPage('L', 'OTH 3');
    return unit;
}

/** The five list rows below the title of the left page, trimmed */
const listRows = (): string[] => Screen.read().rows('L').slice(1).map(r => r.trimEnd());

/** The second list row with its blanks collapsed, so that it does not depend on where the question mark stands */
const question = (): string => listRows()[1].replace(/ +/g, ' ');

/** The attribute of the first cell of a left row over one blink cycle of the unit, sorted */
async function firstCellCycle(row: number): Promise<string[]> {
    return (await blinkCycle(() => Screen.read().maskRows('L')[row][0])).sort();
}

describe('List, scrolling with the cursor (3-47)', () => {
    // 3-47: with more than five airports the left outer knob scrolls the cursor down the OTH 4 list to the ones below
    // the page. Six airports: every one comes under the cursor in turn, in a row of the five-row list
    it('brings every airport of a list longer than the page under the cursor, one per click (3-47)', async () => {
        const unit = await oth4(['KAAA', 'KBBB', 'KCCC', 'KDDD', 'KEEE', 'KFFF']);
        await unit.panel.cursor('L');

        // focused() reads the inverted cells of the screen, so an airport under the cursor but scrolled out reads as
        // none
        const seen: string[] = [unit.panel.focused('L').text.trim()];
        for (let i = 0; i < 5; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L').text.trim());
        }

        expect(seen).toEqual(['KAAA', 'KBBB', 'KCCC', 'KDDD', 'KEEE', 'KFFF']);
        expect(listRows()).toContain('KFFF');
        expect(listRows()).not.toContain('KAAA'); // the page holds five, so the first left it
    });
});

describe('List, scrolling with the cursor (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // The 89's user waypoint list, scrolled with the cursor to its last entry and then the cursor turned off, stays
    // scrolled (trainer T23, checked in the KLN 89 trainer, 2026-10-08). Where the cursor comes back is not asserted
    // here
    it('keeps the list scrolled when the cursor is turned off (checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await oth3(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG']);
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 6); // GGG

            await unit.panel.cursor('L');

            expect(Screen.read().status().left).toBe('OTH 3'); // Precondition: the cursor is off
            expect(listRows().map(r => r.slice(0, 3))).toEqual(['CCC', 'DDD', 'EEE', 'FFF', 'GGG']);
        });
});

describe('List, scrolling with the cursor (characterization)', () => {
    // The list scrolls only as far as the cursor needs: down, the item under the cursor is in the last row; back up,
    // in the first row
    it('characterization: scrolls by one row at the bottom and back to the cursor row at the top', async () => {
        const unit = await oth3(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6); // GGG
        expect(listRows().map(r => r.slice(0, 3))).toEqual(['CCC', 'DDD', 'EEE', 'FFF', 'GGG']); // Precondition

        await unit.panel.outer('L', -5); // BBB

        expect(listRows().map(r => r.slice(0, 3))).toEqual(['BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
        expect(unit.panel.focused('L').row).toBe(1);
    });

    // A deletion rebuilds the list; the rebuilt list scrolls again from its top to the item under the cursor
    it('characterization: shows BBB to FFF with the cursor on FFF after the last of seven is deleted', async () => {
        const unit = await oth3(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6); // GGG

        await unit.panel.clr();
        await unit.panel.ent();

        expect(listRows().map(r => r.slice(0, 3))).toEqual(['BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 0, text: 'FFF   I    '});
    });
});

// LastItemAlwaysVisibleList keeps the last item in the bottom row while the cursor is above it (APT 7, APT 8). Host:
// the approach list of APT 8 with seven circling approaches VOR-A to VOR-G of KPRC (approachWorld)
describe('LastItemAlwaysVisibleList on APT 8 (characterization)', () => {
    async function apt8WithSevenApproaches(): Promise<HeadlessUnit> {
        const w = approachWorld();
        const circling = (suffix: string) => approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '', suffix,
            final: [Leg.IF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(circling)});
        const facilities = [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.mapaa];
        const unit = await bootUnit({facilities, position: w.north(40)});
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        return unit;
    }

    const approachRows = () => Screen.read().rows('R').slice(1).map(r => r.trim());

    it('characterization: shows the last approach in the bottom row until the cursor reaches it, then scrolls back up',
        async () => {
            const unit = await apt8WithSevenApproaches();
            expect(approachRows()).toEqual(['1 VOR-A', '2 VOR-B', '3 VOR-C', '4 VOR-D', '7 VOR-G']);

            await unit.panel.outer('R', 5); // VOR-F
            expect(approachRows()).toEqual(['3 VOR-C', '4 VOR-D', '5 VOR-E', '6 VOR-F', '7 VOR-G']);
            expect(unit.panel.focused('R').text.trim()).toBe('6 VOR-F');

            await unit.panel.outer('R', -5); // VOR-A
            expect(approachRows()).toEqual(['1 VOR-A', '2 VOR-B', '3 VOR-C', '4 VOR-D', '7 VOR-G']);
            expect(unit.panel.focused('R').text.trim()).toBe('1 VOR-A');
        });
});

describe('SimpleListItem on OTH 4 (3-47)', () => {
    // 3-47: the cursor on an airport, CLR and then ENT delete its remarks: CLR alone deletes nothing
    it('deletes nothing on CLR and the remarks of the airport under the cursor on the ENT that follows (3-47)',
        async () => {
            const unit = await oth4(['KAAA', 'KBBB', 'KCCC']);
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 1); // KBBB

            await unit.panel.clr();
            expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA', 'KBBB', 'KCCC']);

            await unit.panel.ent();
            expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA', 'KCCC']);
        });
});

describe('SimpleListItem on OTH 4, the DEL question (#NEW-5-3)', () => {
    // The 90B guide does not show the OTH 4 question; FPL and OTH 3 put the question mark in a fixed column, after the
    // ident padded to five cells, and the KLN 89 trainer does the same on its remarks list (T25, checked in the KLN 89
    // trainer, 2026-10-08: the ident stays in its column and the question mark stands in a fixed column). That is an
    // extension of the 90B's own FPL and OTH 3 text to OTH 4: the pin takes the column those two use
    it.fails('puts the question mark in the fixed column of FPL and OTH 3 ' +
        '(checked in the KLN 89 trainer, 2026-10-08, #NEW-5-3)',
        async () => {
            const unit = await oth4(['KAAA', 'KBBB']);
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 1); // KBBB

            await unit.panel.clr();

            expect(listRows()[1]).toBe('DEL KBBB  ?');
        });

    // The sibling of the pin: the question is there, with the ident, whatever the gap
    it('characterization: asks DEL, the ident and a question mark on CLR', async () => {
        const unit = await oth4(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // KBBB

        await unit.panel.clr();

        expect(question()).toBe('DEL KBBB ?');
        expect(unit.panel.focused('L').row).toBe(2);
    });
});

describe('SimpleListItem on OTH 4 (characterization)', () => {
    it('characterization: a second CLR withdraws the DEL question and keeps the remarks', async () => {
        const unit = await oth4(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // KBBB
        await unit.panel.clr();
        expect(question()).toBe('DEL KBBB ?'); // Precondition

        await unit.panel.clr();

        expect(listRows()[1]).toBe('KBBB');
        expect(unit.panel.focused('L').text).toBe('KBBB');
        await unit.panel.ent(); // ENT no longer deletes
        expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA', 'KBBB']);
    });

    // The row under the cursor is steady inverse; the DEL question flashes: normal for one display tick in four
    it('characterization: the DEL question flashes, the plain row under the cursor does not', async () => {
        const unit = await oth4(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        expect(await firstCellCycle(1)).toEqual(['I', 'I', 'I', 'I']);

        await unit.panel.clr();

        expect(await firstCellCycle(1)).toEqual(['F', 'I', 'I', 'I']);
    });
});
