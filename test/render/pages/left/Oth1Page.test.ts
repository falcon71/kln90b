import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// The sim's database has no Flight Service Stations, so the page always shows its empty state (Oth1Page cites a video
// of the real unit for the text)
describe('OTH 1 page (characterization)', () => {
    it('characterization: the empty page without FSS data', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'OTH 1');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "NO NEAREST 
          FSS        
                     
                     
                     
                     "
        `);
    });
});
