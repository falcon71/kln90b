import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

/** Panel XML of an instrument with the given inputs interfaced */
function panelXml(o: { airdata?: boolean; fuel?: boolean }): string {
    const airdata = o.airdata ? '<Airdata><IsInterfaced>true</IsInterfaced></Airdata>' : '';
    const fuel = o.fuel ? '<FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer>' : '';
    return `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>${airdata}${fuel}</Input></Instrument></PlaneHTMLConfig>`;
}

/** The page names the inner knob steps through on one side, from the first page of the group until the group wraps around */
async function walk(unit: HeadlessUnit, side: 'L' | 'R', first: string): Promise<string[]> {
    await unit.panel.selectPage(side, first);
    const read = () => Screen.read().status()[side === 'L' ? 'left' : 'right'];
    const names = [read()];
    for (let i = 0; i < 40; i++) {
        await unit.panel.inner(side, 1);
        const n = read();
        if (n === names[0]) break;
        if (n !== names[names.length - 1]) names.push(n);
    }
    return names;
}

/** OTH 1 to OTH n as the status line shows them: the two-digit page is OTH10, without the blank */
const oth = (n: number) => Array.from({length: n}, (_, i) => i + 1 < 10 ? `OTH ${i + 1}` : `OTH${i + 1}`);

// The OTH group has the air data pages (OTH 9 and 10 of the full group, named after the pages that remain: 5 and 6
// without a fuel computer) only for a unit with an air data input, and the fuel computer pages (OTH 5 to 8) only for a
// unit with a fuel computer. 5-39 describes the air data page, 5-42 the fuel computer pages. PageTreeController prunes
// the module-level tree in place, and a power cycle builds the controller again over the pruned tree (#90).
describe('OTH pages of a unit with and without air data and fuel computer (#90)', () => {
    it('air data only: OTH 1 to OTH 6 before any power cycle (5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml({airdata: true})});

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(6));
    });

    it('neither: OTH 1 to OTH 4 after a power cycle (5-39, 5-42)', async () => {
        const unit = await bootUnit({panelXml: panelXml({})});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(4));
    });

    it('fuel computer only: OTH 1 to OTH 8 after a power cycle (5-42)', async () => {
        const unit = await bootUnit({panelXml: panelXml({fuel: true})});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(8));
    });

    it('air data and fuel computer: OTH 1 to OTH 10 after a power cycle (5-39, 5-42)', async () => {
        const unit = await bootUnit({panelXml: panelXml({airdata: true, fuel: true})});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(10));
    });

    // Today the second controller prunes the already pruned tree: splice(4, 4) takes the air data pages away instead of
    // pages that are not there
    it.fails('air data only: still OTH 1 to OTH 6 after a power cycle (#90)', async () => {
        const unit = await bootUnit({panelXml: panelXml({airdata: true})});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(6));
    });
});
