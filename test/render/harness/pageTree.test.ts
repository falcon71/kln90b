import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {AIRDATA, fuelComputer, panelXml} from '../../harness/panelXml';
import {Screen} from '../../harness/render/screen';
import {LEFT_PAGE_TREE, RIGHT_PAGE_TREE} from '../../../kln90b/pages/PageTreeController';

const FUEL_COMPUTER_PANEL_XML = panelXml(fuelComputer());
const AIRDATA_AND_FUEL_PANEL_XML = panelXml({...AIRDATA, ...fuelComputer()});
const OTH = 7;
const APT = 5;

/**
 * The tests run in order. Every PageTreeController builds its own copy of the module-level tree (#90), so the harness
 * does not restore the trees between units: a later boot in the same file has the pages of its own panel.xml only if no
 * earlier boot changed the shared trees.
 */
describe('page trees between units (harness)', () => {
    it('leaves the module-level trees whole after a unit without fuel computer and air data, and its power cycle', async () => {
        const unit = await bootUnit();
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(LEFT_PAGE_TREE[OTH].length).toBe(10);
        expect(RIGHT_PAGE_TREE[APT].length).toBe(8);
    });

    it('gives the next unit the full tree, so a fuel computer unit reaches OTH 5', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_PANEL_XML});
        await unit.panel.selectPage('L', 'OTH 5');
        expect(Screen.read().leftName()).toBe('OTH 5');
    });

    it('still has the airdata pages for a third unit', async () => {
        const unit = await bootUnit({panelXml: AIRDATA_AND_FUEL_PANEL_XML});
        await unit.panel.selectPage('L', 'OTH 9');
        expect(Screen.read().leftName()).toBe('OTH 9');
    });
});
