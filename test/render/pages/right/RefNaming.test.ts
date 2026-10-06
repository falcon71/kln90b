import {describe, expect, it} from 'vitest';
import {FacilityType} from '@microsoft/msfs-sdk';
import {bootUnit} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

// FPL 0 KAAA to KBBB runs due south along 8 E; the fix lies 0.2 deg east of the middle of the leg, so a
// perpendicular to the leg exists (5-21).
async function createReference(ident: string): Promise<string[]> {
    const kaaa = airport('KAAA', 47.0, 8.0);
    const kbbb = airport('KBBB', 46.0, 8.0);
    const unit = await bootUnit({facilities: [kaaa, kbbb, intersection(ident, 46.5, 8.2)], storage: savedFlightplan(0, [kaaa, kbbb])});
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.selectPage('R', 'REF');
    await unit.panel.cursor('R');
    await unit.panel.type('R', ident);
    await unit.panel.ent(); // the waypoint page of the reference (5-21, step 5)
    await unit.panel.ent(); // creates the reference waypoint (step 6)
    expect(unit.errors).toEqual([]);
    const names: string[] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => names.push(f.icaoStruct.region + ':' + f.icaoStruct.ident), [FacilityType.USR]);
    return names;
}

describe('REF waypoint names (5-22)', () => {
    // 5-22: the reference waypoint is named after the intersection plus the first free letter
    it('appends the first free letter to a four-character ident', async () => {
        expect(await createReference('ABCD')).toEqual(['XY:ABCDA']);
    });

    // 5-22: a five-character ident drops its fifth character and still gets a letter (DUSTT becomes DUSTA). The
    // generator tries the four characters without a letter first, which the EFB import wants (CUST) and REF must not.
    it.fails('drops the fifth character and appends a letter (#172)', async () => {
        expect(await createReference('ABCDE')).toEqual(['XY:ABCDA']);
    });
});
