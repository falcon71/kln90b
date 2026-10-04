import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

describe('APT 2 page', () => {
    // 3-43: the elevation is shown in feet, rounded to 10 ft. The database holds meters (1234 ft are 376.2 m)
    it('shows the elevation in feet, rounded to 10 (#35)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 8.0, {elevationFt: 1234})]});
        await unit.panel.selectPage('R', 'APT 2');

        const rows = Screen.read().half('R').split('\n');

        expect(rows[3]).toBe('ELV  1230ft');
    });
});
