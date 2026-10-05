import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BUserRemarkSettings} from '../../../kln90b/settings/KLN90BUserRemarkSettings';
import {RemarksManager} from '../../../kln90b/settings/RemarksManager';

// Persisted user data, docs/architecture.md Core 7: an airport's remarks are stored in the slots rmk0 to rmk9 as the
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

    it.fails('does not bring a deleted remark back after a reload (#92)', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('KAAA', ['A          ', '           ', '           ']);
        manager.deleteRemarks('KAAA');

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toEqual([]);
    });

    // The sibling of the pin below: ten airports fill every slot there is and survive a reload
    it('keeps the remarks of ten airports after a reload', () => {
        const manager = new RemarksManager(bus, userSettings);
        for (let i = 0; i < 10; i++) {
            manager.saveRemarks(`K${String.fromCharCode(65 + i)}AA`, ['X          ', '           ', '           ']);
        }

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toEqual(
            ['KAAA', 'KBAA', 'KCAA', 'KDAA', 'KEAA', 'KFAA', 'KGAA', 'KHAA', 'KIAA', 'KJAA']);
    });

    // 3-47: the unit holds the remarks of up to 100 airports
    it.fails('keeps the remarks of an 11th airport after a reload (#92)', () => {
        const manager = new RemarksManager(bus, userSettings);
        for (let i = 0; i < 11; i++) {
            manager.saveRemarks(`K${String.fromCharCode(65 + i)}AA`, ['X          ', '           ', '           ']);
        }

        expect(new RemarksManager(bus, userSettings).getAirportsWithRemarks()).toHaveLength(11);
    });
});

describe('remarks of an airport with a three-character ident (#NEW-7-1)', () => {
    // 3-47: remarks belong to an airport. The ident-length premise is not from 3-47: the stored format holds the ident in a
    // 4-cell field (docs/architecture.md Core 7), and real airport databases carry 3-character idents, so a shorter ident
    // has to survive the save and the load.
    it.fails('restores the remarks of an airport with a three-character ident after a reload (#NEW-7-1)', () => {
        const manager = new RemarksManager(bus, userSettings);
        manager.saveRemarks('ABC', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);

        const reloaded = new RemarksManager(bus, userSettings);

        expect(reloaded.getAirportsWithRemarks()).toEqual(['ABC']);
        expect(reloaded.getRemarks('ABC')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
    });

    // The sibling: the live manager keeps the three-character airport, so the pin fails on the reload and not before
    it('keeps the remarks of a three-character airport in the manager that saved them', () => {
        const manager = new RemarksManager(bus, userSettings);

        manager.saveRemarks('ABC', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);

        expect(manager.getAirportsWithRemarks()).toEqual(['ABC']);
        expect(manager.getRemarks('ABC')).toEqual(['LINE ONE   ', 'LINE TWO   ', 'LINE THREE ']);
    });
});
