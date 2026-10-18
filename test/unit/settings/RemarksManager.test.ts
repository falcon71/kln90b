import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BUserRemarkSettings} from '../../../kln90b/settings/KLN90BUserRemarkSettings';
import {RemarksManager} from '../../../kln90b/settings/RemarksManager';

// Persisted user data, docs/architecture.md Core 7: an airport's remarks are stored in the slots rmk0 to rmk99 as the
// ident (4 characters) followed by three lines of 11 characters. The page behavior (three lines of 11, at most 100
// airports) is 3-47. Users keep their remarks across versions, so the format is a contract (CLAUDE.md "Public
// contract with aircraft", persisted user data).
const bus = new EventBus();
const userSettings = new KLN90BUserSettings(bus);
const remarkSettings = KLN90BUserRemarkSettings.getManager(bus);

function slot(i: number): string {
    return remarkSettings.getSetting(`rmk${i}`).get();
}

function setSlot(i: number, value: string): void {
    remarkSettings.getSetting(`rmk${i}`).set(value);
}

const EMPTY_LINES = ['           ', '           ', '           '];

// The unit stage has no teardown: the slots are shared by the tests of this file
beforeEach(() => remarkSettings.getAllSettings().forEach(s => s.set('')));

describe('remarks storage format', () => {
    it('stores an airport ident and three lines of 11 characters in rmk0', () => {
        const manager = new RemarksManager(bus, userSettings);

        manager.saveRemarks('KAAA', ['FUEL 100LL ', 'CTAF 122.8 ', '           ']);

        expect(slot(0)).toBe('KAAAFUEL 100LL CTAF 122.8            ');
        expect(slot(1)).toBe('');
    });

    it('loads the remarks from hand-written slots and lists the airports sorted', () => {
        setSlot(0, 'KBBBLINE ONE   LINE TWO   LINE THREE ');
        setSlot(1, 'KAAAA          B          C          ');

        const manager = new RemarksManager(bus, userSettings);

        expect(manager.getRemarks('KBBB')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
        expect(manager.getRemarks('KAAA')).toEqual(['A          ', 'B          ', 'C          ']);
        expect(manager.getAirportsWithRemarks()).toEqual(['KAAA', 'KBBB']);
    });

    it('returns three blank lines for an airport without remarks', () => {
        setSlot(0, 'KBBBLINE ONE   LINE TWO   LINE THREE ');

        const manager = new RemarksManager(bus, userSettings);

        expect(manager.getRemarks('KCCC')).toEqual(EMPTY_LINES);
    });

    it('round-trips four-character airports through a new manager', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('KBBB', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
        manager.saveRemarks('KAAA', ['FUEL 100LL ', '           ', '           ']);

        const reloaded = new RemarksManager(bus, userSettings);

        expect(reloaded.getAirportsWithRemarks()).toEqual(['KAAA', 'KBBB']);
        expect(reloaded.getRemarks('KBBB')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
        expect(reloaded.getRemarks('KAAA')).toEqual(['FUEL 100LL ', '           ', '           ']);
    });
});

describe('remarks of a deleted airport and of many airports (#92)', () => {
    // 3-47: deleting an airport's remarks removes them. This sibling holds the live manager and passes today.
    it('removes a deleted airport from the manager that deleted it', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('KAAA', ['A          ', '           ', '           ']);

        manager.deleteRemarks('KAAA');

        expect(manager.getAirportsWithRemarks()).toEqual([]);
        expect(manager.getRemarks('KAAA')).toEqual(EMPTY_LINES);
    });

    it('does not bring a deleted remark back after a reload (#92)', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('KAAA', ['A          ', '           ', '           ']);
        manager.deleteRemarks('KAAA');

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toEqual([]);
    });

    // Ten airports were all the slots there were before #92
    it('keeps the remarks of ten airports after a reload', () => {
        const manager = new RemarksManager(bus, userSettings);
        for (let i = 0; i < 10; i++) {
            manager.saveRemarks(`K${String.fromCharCode(65 + i)}AA`, ['X          ', '           ', '           ']);
        }

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toEqual(
            ['KAAA', 'KBAA', 'KCAA', 'KDAA', 'KEAA', 'KFAA', 'KGAA', 'KHAA', 'KIAA', 'KJAA']);
    });

    // 3-47: the unit holds the remarks of up to 100 airports
    it('keeps the remarks of an 11th airport after a reload (#92)', () => {
        const manager = new RemarksManager(bus, userSettings);
        for (let i = 0; i < 11; i++) {
            manager.saveRemarks(`K${String.fromCharCode(65 + i)}AA`, ['X          ', '           ', '           ']);
        }

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toHaveLength(11);
    });
});

describe('remarks of an airport with a three-character ident (#140)', () => {
    // 3-47: remarks belong to an airport. The ident-length premise is not from 3-47: the stored format holds the ident in a
    // 4-cell field (docs/architecture.md Core 7), and real airport databases carry 3-character idents, so a shorter ident
    // has to survive the save and the load.
    it('restores the remarks of an airport with a three-character ident after a reload (#140)', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('ABC', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);

        const reloaded = new RemarksManager(bus, userSettings);

        expect(reloaded.getAirportsWithRemarks()).toEqual(['ABC']);
        expect(reloaded.getRemarks('ABC')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
    });

    // The stored ident is padded with blanks to 4 characters, so that the three lines start at character 4 as they do for
    // a four-character ident (docs/architecture.md Core 7). The four-character idents are stored as before.
    it.each([
        ['ABC', 'ABC '],
        ['AB', 'AB  '],
        ['A', 'A   '],
        ['ABCD', 'ABCD'],
    ])('stores the ident %s as %j in front of the three lines (#140)', (ident, stored) => {
        new RemarksManager(bus, userSettings).saveRemarks(ident, ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);

        expect(slot(0)).toBe(`${stored}LINE ONE   LINE TWO   LINE THREE `);
    });

    it.each([
        ['ABC', 'ABC '],
        ['AB', 'AB  '],
        ['ABCD', 'ABCD'],
    ])('loads the ident %s from a slot that holds %j in front of the three lines (#140)', (ident, stored) => {
        setSlot(0, `${stored}LINE ONE   LINE TWO   LINE THREE `);

        const manager = new RemarksManager(bus, userSettings);

        expect(manager.getAirportsWithRemarks()).toEqual([ident]);
        expect(manager.getRemarks(ident)).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
    });

    // The live manager keeps the three-character airport, whatever the slots hold, so a failure of the reload tests above is not about this
    it('keeps the remarks of a three-character airport in the manager that saved them', () => {
        const manager = new RemarksManager(bus, userSettings);

        manager.saveRemarks('ABC', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);

        expect(manager.getAirportsWithRemarks()).toEqual(['ABC']);
        expect(manager.getRemarks('ABC')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
    });
});

/** A manager loaded from 100 stored slots, the airports K000 to K099, laid out by hand from the format (Core 7) */
function managerWith100Airports(): RemarksManager {
    for (let i = 0; i < 100; i++) {
        setSlot(i, `K${String(i).padStart(3, '0')}X          ${' '.repeat(22)}`);
    }
    return new RemarksManager(bus, userSettings);
}

describe('remarks of a 101st airport (3-47, C-2)', () => {
    // 3-47: the unit holds the remarks of up to 100 airports. This is the sibling of the pin below: the same manager
    it('holds the remarks of 100 airports (3-47)', () => {
        const manager = managerWith100Airports();

        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
        expect(manager.getRemarks('K099')).toEqual(['X          ', '           ', '           ']);
    });

    // C-2: the message RMKS FULL says that the remarks of another airport do not fit. Before #92 the guard read the
    // length of an object that has none, so it never fired and the save went on to a slot that did not exist
    it('refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2, #92)', () => {
        const manager = managerWith100Airports();

        expect(() => manager.saveRemarks('KZZA', ['X          ', '           ', '           '])).toThrow('RMKS FULL');
        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
        expect(manager.getAirportsWithRemarks()).not.toContain('KZZA');
    });
});

// 3-47 gives room for the remarks of 100 airports and C-2 names RMKS FULL for one more. A change or a delete of an
// airport that is listed adds no airport, so it fits a full list (the note on #92)
describe('remarks of an airport in a full list (#92)', () => {
    it('changes the remarks of an airport in a full list, and keeps the change after a reload (#92)', () => {
        const manager = managerWith100Airports();

        manager.saveRemarks('K050', ['CHANGED    ', '           ', '           ']);

        expect(new RemarksManager(bus, userSettings).getRemarks('K050')).toEqual(['CHANGED    ', '           ', '           ']);
    });

    it('deletes the remarks of an airport in a full list, which makes room for another (#92)', () => {
        const manager = managerWith100Airports();

        manager.deleteRemarks('K050');
        manager.saveRemarks('KZZA', ['X          ', '           ', '           ']);

        const reloaded = new RemarksManager(bus, userSettings).getAirportsWithRemarks();
        expect(reloaded).toHaveLength(100);
        expect(reloaded).not.toContain('K050');
        expect(reloaded).toContain('KZZA');
    });

    // The last slot is emptied too: the airport stored in rmk99 does not come back after a reload once it is deleted
    it('empties the last slot when the airport stored in it is deleted, and does not bring it back (#92)', () => {
        const manager = managerWith100Airports();
        expect(slot(99)).toBe(`K099X          ${' '.repeat(22)}`);

        manager.deleteRemarks('K099');

        expect(slot(99)).toBe('');
        const reloaded = new RemarksManager(bus, userSettings).getAirportsWithRemarks();
        expect(reloaded).toHaveLength(99);
        expect(reloaded).not.toContain('K099');
    });

    // OTH 4 deletes only listed airports and APT 5 always saves its three lines, so a pilot cannot reach this; the
    // method is public, and a delete never overflows the list
    it('accepts the delete of an airport without remarks in a full list (#92)', () => {
        const manager = managerWith100Airports();

        expect(() => manager.deleteRemarks('KZZA')).not.toThrow();
        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
    });
});
