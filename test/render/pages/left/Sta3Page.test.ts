import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// STA 3 shows the version, which the build injects into Version.ts; the source carries a placeholder 18 cells wide
// (testing.md section 4)
vi.mock('../../../../kln90b/Version', () => ({VERSION: '2.2.0'}));

// The page shows the version of this project as the host software, a fixed receiver software and the default OBS
// calibration, each version on a row of its own: the layout is the project's own
describe('STA 3 page (characterization)', () => {
    it('characterization: the software versions and the OBS calibration', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'STA 3');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "HOST SW    
                2.2.0
          RCVR SW    
                   02
                     
          OBS CAL 100"
        `);
    });
});
