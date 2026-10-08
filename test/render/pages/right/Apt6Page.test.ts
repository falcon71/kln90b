import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The sim's airport facilities carry no customs, fuel, oxygen or landing fee data (Apt6Page.formatFuel: the fuel fields
// are always empty), so every airport shows the same services
const KAAA = () => airport('KAAA', 47, 8);

describe('APT 6 page (characterization)', () => {
    // NO FUEL, NO OXYGEN and NO FEE INFO are the fixed texts of the code, not data of the airport: the sim supplies no
    // service data (Apt6Page.formatFuel), so the page cannot tell an airport without fuel from one without data
    it('shows the services of an airport without service data', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 6');

        expect(Screen.read().half('R')).toMatchInlineSnapshot(`
          " KAAA      
                     
          NO FUEL    
                     
          NO OXYGEN  
          NO FEE INFO"
        `);
    });
});

describe('APT 6 page without service data in the database (3-48)', () => {
    // 3-48: a blank customs line means the database has no customs information, and NO FEE INFO on the sixth line means
    // it has none on a landing fee. The sim's database has neither.
    it('leaves the customs line blank and shows NO FEE INFO on the sixth line (3-48)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 6');

        const rows = Screen.read().rows('R');
        expect(rows[1]).toBe(' '.repeat(11));
        expect(rows[5]).toBe('NO FEE INFO');
    });
});
