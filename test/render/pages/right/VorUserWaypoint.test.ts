import {describe, expect, it} from 'vitest';
import {FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
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
