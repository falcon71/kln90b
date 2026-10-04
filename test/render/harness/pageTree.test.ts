import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {LEFT_PAGE_TREE} from '../../../kln90b/pages/PageTreeController';
import {Oth5Page} from '../../../kln90b/pages/left/Oth5Page';

const FUEL_COMPUTER_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input></Instrument></PlaneHTMLConfig>';
const OTH = 7;

/**
 * The two tests run in order: PageTreeController prunes the module-level LEFT_PAGE_TREE in place (#90), so the second boot
 * only has the fuel pages if the teardown of the first put the tree back.
 */
describe('left page tree between units (harness)', () => {
    it('prunes the fuel computer pages of a unit without a fuel computer', async () => {
        await bootUnit();
        expect((LEFT_PAGE_TREE[OTH] as unknown[]).includes(Oth5Page)).toBe(false);
    });

    it('gives the next unit the full tree, so a fuel computer unit reaches OTH 5', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_PANEL_XML});
        expect((LEFT_PAGE_TREE[OTH] as unknown[]).includes(Oth5Page)).toBe(true);
        await unit.panel.selectPage('L', 'OTH 5');
        expect(Screen.read().leftName()).toBe('OTH 5');
    });
});
