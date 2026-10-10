import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {AIRDATA, fuelComputer, panelXml} from '../../harness/panelXml';
import {Screen} from '../../harness/render/screen';
import {LEFT_PAGE_TREE} from '../../../kln90b/pages/PageTreeController';
import {Oth5Page} from '../../../kln90b/pages/left/Oth5Page';

const FUEL_COMPUTER_PANEL_XML = panelXml(fuelComputer());
const AIRDATA_AND_FUEL_PANEL_XML = panelXml({...AIRDATA, ...fuelComputer()});
const OTH = 7;

/**
 * The tests run in order: PageTreeController prunes the module-level LEFT_PAGE_TREE in place (#90), so a later boot only
 * has the pages of its own panel.xml if every teardown put the tree back. The third boot is needed to see a restore that
 * hands the snapshot's own arrays to the tree: the second boot then prunes the snapshot, and only the third sees it.
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

    it('still has the airdata pages for a third unit, after the second pruned its own', async () => {
        const unit = await bootUnit({panelXml: AIRDATA_AND_FUEL_PANEL_XML});
        expect(LEFT_PAGE_TREE[OTH].length).toBe(10);
        await unit.panel.selectPage('L', 'OTH 9');
        expect(Screen.read().leftName()).toBe('OTH 9');
    });
});
