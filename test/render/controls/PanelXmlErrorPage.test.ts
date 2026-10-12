import {describe, expect, it, vi} from 'vitest';
import {bootUnit, MINIMAL_PANEL_XML} from '../../harness/boot';
import {panelXml, VFR_ONLY} from '../../harness/panelXml';

const page = () => document.querySelector('.panelxmlerrorpage')!;
const isShown = (el: Element) => !el.classList.contains('d-none');
const lines = () => [...page().querySelectorAll('.errormessage > div')].map(l => l.textContent);

// #145: invalid panel.xml values are shown to the aircraft developer on a page of their own. Like the error page, this
// is not part of the real unit
describe('panel.xml error page (#145)', () => {
    it('stays hidden for a valid panel.xml', async () => {
        await bootUnit({panelXml: MINIMAL_PANEL_XML});

        expect(isShown(page())).toBe(false);
    });

    it('lists the exact problems without a stack, and OK hides it while the unit keeps running on the defaults', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ObsSource': 'one', 'Input.FuelComputer.Unit': 'gal'})});

        expect(isShown(page())).toBe(true);
        expect(lines()).toEqual([
            'Input.ObsSource: "one" is not one of 0, 1, 2. The default 1 is used.',
            'Input.FuelComputer.Unit: "gal" is not one of GAL, IMP, L, KG, LB. The default GAL is used.',
        ]);
        expect(page().textContent).not.toMatch(/ at /);
        expect([...page().querySelectorAll('button')].map(b => b.textContent!.trim())).toEqual(['OK']);
        // Not an exception, so the error page is not involved
        expect(unit.errors).toEqual([]);
        expect(isShown(document.querySelector('.errorpage')!)).toBe(false);

        (page().querySelector('button') as HTMLButtonElement).click();
        expect(isShown(page())).toBe(false);

        expect(unit.props.planeSettings.input.obsSource).toBe(1);
        await unit.panel.show('R', 'APT 1'); // throws if the knobs do not reach the page
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.errors).toEqual([]);
        expect(isShown(page())).toBe(false);
    });

    it('lists the VFR only unit with an approach arm switch', async () => {
        await bootUnit({panelXml: panelXml({...VFR_ONLY, 'Input.ExternalSwitches.AppArmSwitchInstalled': true})});

        expect(lines()).toEqual([
            'Input.ExternalSwitches.AppArmSwitchInstalled: a VFR only unit (VFROnly true) has no approach arm switch. The default false is used.',
        ]);
    });

    // An exception at boot after the panel.xml problems is shown on top, and the list is still there after its OK
    it('lies below the error page', async () => {
        await bootUnit({panelXml: panelXml({'VFROnly': 'yes'})});

        const errorPage = document.querySelector('.errorpage')!;
        expect(page().compareDocumentPosition(errorPage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
