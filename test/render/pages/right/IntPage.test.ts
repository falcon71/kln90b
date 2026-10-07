import {describe, expect, it, vi} from 'vitest';
import {VorClass, VorType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {intersection, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

describe('INT page', () => {
    // 3-14 to 3-15: a reference waypoint is confirmed on its waypoint page, and the second ENT accepts it
    it('takes a REF waypoint through the confirmation page (#72)', async () => {
        const unit = await bootUnit({
            facilities: [intersection('INTA', 47.1, 8.0), vor('ABC', 47.2, 8.0), vor('XYZ', 48.5, 8.0)],
            position: {lat: 47.0, lon: 8.0},
        });
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000); // the REF calculation takes 8 s (REF_CALCULATION_TIME)
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC'); // the REF field, which shows the nearest VOR
        await unit.panel.enterIdent('R', 'XYZ');

        await unit.panel.ent();

        // The confirmation page offers ENT (the "ent" message of the status line) and shows the VOR page of XYZ
        expect(Screen.read().status().right).toBe('VOR');
        expect(Screen.read().status().mode).toBe('enr-leg ent');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('CRSR');
        expect(screen.rows('R')[1]).toBe('REF:  XYZ  ');
    });
});

/** The INT page of INTA (47.1 N 8.0 E) once its REF calculation has run (REF_CALCULATION_TIME is 8 s); returns the REF row */
async function refRow(unit: HeadlessUnit): Promise<string> {
    await unit.panel.selectPage('R', 'INT  ');
    await vi.advanceTimersByTimeAsync(9000);
    expect(Screen.read().rows('R')[0]).toBe(' INTA      '); // precondition
    return Screen.read().rows('R')[1];
}

// 3-50: the INT page gives the position of the intersection as radial and distance from the closest VOR (NearestUtils
// .getNearestVor). Only NAV 2 is said to leave terminal VORs out (3-8, 3-32).
describe('INT page reference VOR (3-50)', () => {
    const inta = () => intersection('INTA', 47.1, 8.0);
    const far = () => vor('FAR', 47.3, 8.0); // 12 NM from INTA, high altitude

    it('takes the closest VOR', async () => {
        const unit = await bootUnit({facilities: [inta(), far(), vor('NER', 47.15, 8.0)], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  NER  ');
    });

    it('takes a closer terminal VOR', async () => {
        const unit = await bootUnit({facilities: [inta(), far(), vor('TRM', 47.15, 8.0, {vorClass: VorClass.Terminal})], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  TRM  ');
    });

    // A user VOR in the repository has the class and type the user waypoint loaders give it (Unknown, Unknown).
    // IntPage.tsx:221 computes the REF itself because the database field "does not respect user VORs".
    it.fails('takes a closer user VOR (#206)', async () => {
        const unit = await bootUnit({facilities: [inta(), far()], position: {lat: 47.0, lon: 8.0}});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.12, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown}));

        expect(await refRow(unit)).toBe('REF:  QQV  ');
    });
});
