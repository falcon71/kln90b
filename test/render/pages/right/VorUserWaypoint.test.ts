import {describe, expect, it} from 'vitest';
import {FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/**
 * 5-18: a user VOR is made on the VOR page by entering an unknown ident and its position. The longitude is typed as
 * E100: the keyboard does not take a leading zero in the first degree cell.
 */
async function createUserVor(): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    await unit.panel.selectPage('R', 'VOR  ');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'QQQ');
    await unit.panel.ent();
    await unit.panel.outer('R', 2); // from the frequency to the latitude
    await unit.panel.type('R', 'N4700000');
    await unit.panel.ent(); // the cursor moves on to the longitude
    await unit.panel.type('R', 'E1000000');
    await unit.panel.ent();
    expect(unit.errors).toEqual([]);
    return unit;
}

function userWaypoints(unit: HeadlessUnit): [string, string, FacilityType][] {
    const out: [string, string, FacilityType][] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => out.push([f.icaoStruct.region, f.icaoStruct.ident, ICAO.getFacilityTypeFromValue(f.icaoStruct)]));
    return out;
}

describe('user VOR (5-18)', () => {
    it('stores the new waypoint in the user region', async () => {
        const unit = await createUserVor();
        expect(userWaypoints(unit).map(([region, ident]) => [region, ident])).toEqual([['XX', 'QQQ']]);
    });

    it('stores the typed position', async () => {
        const unit = await createUserVor();
        const positions: [number, number][] = [];
        KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => positions.push([f.lat, f.lon]));
        expect(positions).toEqual([[47, 100]]);
    });

    // The V1 string says VOR ('VXX    QQQ  ') but the ICAO value says U, so the repository files it under the
    // supplementary waypoints: OTH 3 lists it as S, and the persistor saves it in the SUP format without frequency.
    it.fails('is a VOR, not a supplementary waypoint (#173)', async () => {
        const unit = await createUserVor();
        expect(userWaypoints(unit)).toEqual([['XX', 'QQQ', FacilityType.VOR]]);
    });

    // 5-20: OTH 3 lists the user waypoints with their type letter
    it('is listed on OTH 3 under its ident', async () => {
        const unit = await createUserVor();
        await unit.panel.cursor('R');
        await unit.panel.selectPage('L', 'OTH 3');
        expect(Screen.read().rows('L')[1].slice(0, 6)).toBe('QQQ   ');
    });

    it.fails('is listed as V on OTH 3 (#173)', async () => {
        const unit = await createUserVor();
        await unit.panel.cursor('R');
        await unit.panel.selectPage('L', 'OTH 3');
        expect(Screen.read().rows('L')[1].slice(0, 7)).toBe('QQQ   V');
    });
});

/** VOR page, cursor, the unknown ident QQQ; a unit with the given magnetic variation everywhere */
async function unknownVor(magvar = 0): Promise<HeadlessUnit> {
    const unit = await bootUnit({magvar});
    await unit.panel.selectPage('R', 'VOR  ');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'QQQ');
    return unit;
}

/** The position of createUserVor, typed with the cursor on the latitude: N 47°00.00' E 100°00.00' */
async function typePosition(unit: HeadlessUnit): Promise<void> {
    await unit.panel.type('R', 'N4700000');
    await unit.panel.ent();
    await unit.panel.type('R', 'E1000000');
    await unit.panel.ent();
}

describe('user VOR page (5-18)', () => {
    // 5-18, figure 5-63: a user VOR that is not defined yet shows the ident, the class U and three lines of dashes: the
    // frequency with the magnetic variation, the latitude, the longitude
    it('shows the class U and three lines of dashes for an unknown ident (5-18)', async () => {
        await unknownVor();

        expect(Screen.read().rows('R')).toEqual([' QQQ       ', '           ', '          U', '___.__ __°_', "_ __°__.__'", "____°__.__'"]);
    });

    // 5-18, figure 5-64: the frequency and the magnetic variation are stored with the user VOR. After the longitude the
    // page shows the waypoint with the cursor off; selecting the page again shows what was stored
    it('stores the entered frequency and magnetic variation (5-18)', async () => {
        const unit = await unknownVor();
        await unit.panel.ent(); // the cursor moves to the frequency
        await unit.panel.type('R', '11390');
        await unit.panel.ent(); // to the magnetic variation
        await unit.panel.type('R', '12W');
        await unit.panel.ent(); // to the latitude
        await typePosition(unit);
        expect(Screen.read().status().right).toBe('VOR');

        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.selectPage('R', 'VOR  ');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').slice(2)).toEqual(['          U', '113.90 12°W', "N 47°00.00'", "E100°00.00'"]);
    });

    // 5-18: without an entered magnetic variation the unit computes one and stores it. The world has 13° E everywhere
    it('computes the magnetic variation when none is entered (5-18)', async () => {
        const unit = await unknownVor(13);
        await unit.panel.ent();
        await unit.panel.outer('R', 2); // from the frequency to the latitude
        await typePosition(unit);

        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.selectPage('R', 'VOR  ');

        expect(Screen.read().rows('R')[3].slice(7)).toBe('13°E');
    });

    // C-1: ENT LAT/LON reminds the pilot of the position while the waypoint is created: a frequency alone does not
    // complete it
    it('shows ENT LAT/LON after the frequency alone (C-1)', async () => {
        const unit = await unknownVor();
        await unit.panel.ent();
        await unit.panel.type('R', '11390');
        await unit.panel.ent();

        expect(Screen.read().status().mode).toBe('ENT LAT/LON');
        expect(userWaypoints(unit)).toEqual([]);
    });

    // C-2: USR DB FULL when a user waypoint is to be created while the user data base holds 250
    it('shows USR DB FULL when the user data base holds 250 waypoints (C-2)', async () => {
        const full = Array.from({length: 250}, (_, i) => ({kind: 'sup' as const, ident: `U${String(i).padStart(3, '0')}`, lat: 46 + i * 0.001, lon: 9}));
        const unit = await bootUnit({storage: savedUserWaypoints(full)});
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQQ');
        await unit.panel.ent();
        await unit.panel.outer('R', 2);
        await typePosition(unit);

        expect(Screen.read().status().mode).toBe('USR DB FULL');
        expect(userWaypoints(unit).filter(([, ident]) => ident === 'QQQ')).toEqual([]);
    });
});

describe('stored user VOR that is not the active waypoint', () => {
    /** The stored user VOR QQV (113.90 MHz, 12° W) on the VOR page with the cursor on; nothing is active */
    async function storedUserVor(): Promise<HeadlessUnit> {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'vor', ident: 'QQV', lat: 47.5, lon: 11.25, freqMHz: 113.9, magvar: 12}])});
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        expect(Screen.read().rows('R').slice(0, 4)).toEqual([' QQV       ', '           ', '          U', '113.90 12°W']); // precondition
        return unit;
    }

    /** Leaves the page and comes back, which shows what the waypoint holds */
    async function reselect(unit: HeadlessUnit): Promise<string[]> {
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.selectPage('R', 'VOR  ');
        return Screen.read().rows('R').slice(3);
    }

    // C-1: only the active waypoint refuses a new variation (IN ACT LIST), so another user VOR takes it
    it('takes a new magnetic variation (C-1)', async () => {
        const unit = await storedUserVor();
        const messages = collectStatusMessages(unit);
        await unit.panel.cursorTo('R', '12°W');
        await unit.panel.type('R', '15E');
        await unit.panel.ent();

        expect(messages).toEqual([]);
        expect(await reselect(unit)).toEqual(['113.90 15°E', "N 47°30.00'", "E 11°15.00'"]);
    });

    // 5-18: the frequency of a user VOR can be edited
    it('takes a new frequency (5-18)', async () => {
        const unit = await storedUserVor();
        await unit.panel.cursorTo('R', '113.90');
        await unit.panel.type('R', '10850');
        await unit.panel.ent();

        expect(await reselect(unit)).toEqual(['108.50 12°W', "N 47°30.00'", "E 11°15.00'"]);
    });
});

describe('user VOR that is the active waypoint (C-1)', () => {
    /** The stored user VOR QQV (12° W) is the Direct To waypoint; the VOR page shows it with the cursor on the magnetic variation */
    async function activeUserVor(): Promise<HeadlessUnit> {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'vor', ident: 'QQV', lat: 47.5, lon: 8.25, freqMHz: 113.9, magvar: 12}])});
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.dct(); // 3-27 rule 3: the waypoint page on the right is the default
        await unit.panel.ent();
        await unit.panel.ent();
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('QQV'); // precondition
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', '12°W');
        await unit.panel.type('R', '15E');
        await unit.panel.ent();
        return unit;
    }

    // C-1: IN ACT LIST when the magnetic variation of the active user VOR is changed, and the stored variation stays
    it('refuses a new magnetic variation with IN ACT LIST (C-1)', async () => {
        const unit = await activeUserVor();
        expect(Screen.read().status().mode).toBe('IN ACT LIST');

        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.selectPage('R', 'VOR  ');
        expect(Screen.read().rows('R')[3]).toBe('113.90 12°W');
    });

    // C-1: the change is refused (another waypoint must be made active first), yet the field keeps showing the refused
    // 15°E until the page is selected again
    it.fails('keeps showing the stored magnetic variation after IN ACT LIST (C-1, #NEW-3-4)', async () => {
        await activeUserVor();

        expect(Screen.read().rows('R')[3]).toBe('113.90 12°W');
    });
});
