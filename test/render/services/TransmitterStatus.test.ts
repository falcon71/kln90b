import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {panelXml} from '../../harness/panelXml';
import {Screen} from '../../harness/render/screen';

// #458, agreed by the maintainer with an EFIS developer (2026-11-04): an EFIS that takes the nav data and the MSG
// annunciation over the bus cannot see when the data stop, so two fictional LVars say whether the unit transmits on an
// output (LVars.ts). 0 while the unit is off, while it boots until the Self Test page shows, and while the output is
// failed

const ARINC = 'L:KLN90B_Arinc429OutputTransmitted';
const RS232 = 'L:KLN90B_Rs232OutputTransmitted';

const transmitted = (unit: HeadlessUnit) => ({
    arinc429: unit.env.sim.get(ARINC, 'bool'),
    rs232: unit.env.sim.get(RS232, 'bool'),
});

const selfTestShown = () => Screen.read().rows('R').some(r => r.trim() === 'APPROVE?');

describe('the output-transmitted LVars (#458)', () => {
    it('are 0 at a cold-and-dark boot with the unit off', async () => {
        const unit = await bootUnit({engineRunning: false});

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(unit.env.sim.lastWrite(ARINC)?.value).toBe(0);
        expect(unit.env.sim.lastWrite(RS232)?.value).toBe(0);
    });

    it('stay 0 while the unit boots and become 1 when the Self Test page shows', async () => {
        const unit = await bootUnit({engineRunning: false});
        await unit.panel.powerOn();

        // The Turn-On page shows for 17 s (TEST_TIME, WelcomePage.tsx)
        await vi.advanceTimersByTimeAsync(10_000);
        expect(selfTestShown()).toBe(false);
        expect(transmitted(unit)).toEqual({arinc429: 0, rs232: 0});

        await vi.advanceTimersByTimeAsync(9_000);
        expect(selfTestShown()).toBe(true);
        // The nav data go on ARINC 429 by default, so the RS-232 output carries nothing
        expect(transmitted(unit)).toEqual({arinc429: 1, rs232: 0});
        expect(unit.errors).toEqual([]);
    });

    it('are 1 at an engine-running start, which skips the Self Test page', async () => {
        const unit = await bootUnit();

        expect(transmitted(unit)).toEqual({arinc429: 1, rs232: 0});
    });

    it('say the RS-232 output while it carries the nav data', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Output.DataInterface': 'RS232'})});

        expect(transmitted(unit)).toEqual({arinc429: 1, rs232: 1});
    });

    it('are 0 from the power-off and through the next boot, also after a short interruption', async () => {
        const unit = await bootUnit();
        expect(transmitted(unit).arinc429).toBe(1);

        await unit.panel.powerOff();
        expect(transmitted(unit).arinc429).toBe(0);

        // A short interruption, below RESET_TIME: the unit boots again all the same
        await vi.advanceTimersByTimeAsync(5_000);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(selfTestShown()).toBe(false);
        expect(transmitted(unit).arinc429).toBe(0);

        await vi.advanceTimersByTimeAsync(14_000);
        expect(selfTestShown()).toBe(true);
        expect(transmitted(unit).arinc429).toBe(1);
    });

    it('are 0 while the output is failed and 1 again at the repair', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Output.DataInterface': 'RS232'})});

        unit.props.failures.fail('arinc429Out');
        expect(transmitted(unit)).toEqual({arinc429: 0, rs232: 1});
        unit.props.failures.fail('rs232Out');
        expect(transmitted(unit)).toEqual({arinc429: 0, rs232: 0});

        unit.props.failures.repair('arinc429Out');
        expect(transmitted(unit)).toEqual({arinc429: 1, rs232: 0});
        unit.props.failures.repairAll();
        expect(transmitted(unit)).toEqual({arinc429: 1, rs232: 1});
    });

    // After a power-on that transmitted: the memory still says the last boot was over, the power says the unit is off
    it('stay 0 at a repair while the unit is off', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('arinc429Out');
        await unit.panel.powerOff();
        expect(transmitted(unit).arinc429).toBe(0);

        unit.props.failures.repair('arinc429Out');

        expect(transmitted(unit).arinc429).toBe(0);
    });

    it('stay 0 for a failed output through the boot', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {failure_arinc429Out: '{}'}});
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);

        expect(selfTestShown()).toBe(true);
        expect(transmitted(unit).arinc429).toBe(0);
    });
});
