import {describe, expect, it} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('STA 2 page (characterization)', () => {
    it('characterization: the estimated position error with a fix', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 2');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "ESTIMATED  
          POSN ERROR 
                .04nm
                     
                     
                     "
        `);
    });

    it('characterization: dashes without a fix', async () => {
        const unit = await bootUnit({coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        await unit.panel.selectPage('L', 'STA 2');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "ESTIMATED  
          POSN ERROR 
                .--nm
                     
                     
                     "
        `);
    });
});
