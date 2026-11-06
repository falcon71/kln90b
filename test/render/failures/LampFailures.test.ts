import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

/**
 * #459: the remote lamps (docs/failures.md, "Annunciators"; the design
 * docs/superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md, "The lamp ports", "What the unit commands"
 * and "Detection"). A dark lamp (bulb, wiring) writes 0, a stuck one (driver) 1; the detector sees the wiring while the
 * lamp is commanded on and the driver while it is commanded off, never the bulb (CMM 25-26)
 */

/**
 * All four lamps installed; ARM and ACTV reach the aircraft only through GPS APPROACH MODE. An IFR unit drives the ARM
 * lamp only with the approach arm switch (KLN90BPlaneSettings, Installation manual 2-6)
 */
const PANEL = panelXml({
    ...APR_ARM_SWITCH,
    'Output.ExternalAnnunciators.MsgInstalled': true, 'Output.ExternalAnnunciators.WptInstalled': true,
    'Output.ExternalAnnunciators.ArmInstalled': true, 'Output.ExternalAnnunciators.ActvInstalled': true,
    'Output.WriteGPSSimVars': true,
});

const MSG = 'L:KLN90B_MsgLight';
const WPT = 'L:KLN90B_WptLight';
const MODE = 'GPS APPROACH MODE';

/** The lamp messages of the list, without the messages the boot brings anyway */
const lampMessages = (unit: HeadlessUnit) => messages(unit).filter(m => m.includes('ANNUNCIATOR'));

/** The values the unit wrote to a SimVar since the mark */
const writesSince = (unit: HeadlessUnit, name: string, mark: number) =>
    unit.env.sim.writes.slice(mark).filter(w => w.name === name.toUpperCase()).map(w => w.value);

/** A failure stored by an earlier session */
const failed = (key: string) => ({[`failure_${key}`]: '{}'});

const POSITION = {lat: 47, lon: 8};

/**
 * An engine-running boot with the GPS settled: en route, no flight plan, so no waypoint alert. The stored last position
 * is the present one, so POSITION DIFFERS FROM LAST POSITION does not light the MSG lamp
 */
async function enRoute(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        panelXml: PANEL, position: POSITION,
        storage: {lastLatitude: POSITION.lat, lastLongitude: POSITION.lon, ...storage},
    });
    await settle(unit);
    expect(unit.props.memory.navPage.waypointAlert).toBe(false); // Precondition: the WPT lamp is commanded off
    return unit;
}

describe('the lamp failures (#459)', () => {
    // The maintainer's decision of 2026-11-05: noticed on the Self Test page, shown with the first navigation page
    it('a wiring fault is found at every power-on', async () => {
        const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('msgWiring')});
        expect(lampMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page
        expect(lampMessages(unit)).toEqual(['CHECK MSG ANNUNCIATOR']);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000); // The Turn-On page, then the Self Test page
        expect(Screen.read().text()).toContain('APPROVE?'); // Precondition: the Self Test page shows
        expect(lampMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100);
        expect(lampMessages(unit)).toEqual(['CHECK MSG ANNUNCIATOR']);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('a wiring fault failed during the Self Test page shows with the first navigation page', async () => {
        const unit = await bootToSelfTest({panelXml: PANEL});
        unit.props.failures.fail('wptWiring');
        await vi.advanceTimersByTimeAsync(2000);
        expect(lampMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100);

        expect(lampMessages(unit)).toEqual(['CHECK WPT ANNUNCIATOR']);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The main page needs the self-test, so this unit starts cold and dark: TEST FAIL is the driver's test (3-4)
    it('a WPT driver fault shows when the lamp is first commanded off', async () => {
        const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('wptDriver')});
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
        expect(lampMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await settle(unit);

        expect(unit.props.memory.navPage.waypointAlert).toBe(false); // Precondition: the WPT lamp is commanded off
        expect(lampMessages(unit)).toEqual(['WPT ANNUNCIATOR FAIL']);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('a bulb fault is never detected', async () => {
        const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('msgBulb')});
        expect(Screen.read().rows('L')[5]).toBe('ANNUN    ON');

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(30_000);

        expect(lampMessages(unit)).toEqual([]);
        expect(unit.props.failures.activeList().map(d => d.key)).toEqual(['msgBulb']); // Precondition: still failed
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The screen still tells the truth (Appendix B): only the remote lamp is dark
    it('a dark MSG lamp', async () => {
        const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('msgBulb')});
        // An unread message of its own: the cold start posts none before its fix, and FAST none at all (#468, test/README.md)
        unit.props.messageHandler.addMessage(new OneTimeMessage(['UNREAD MESSAGE']));
        const mark = unit.env.sim.writes.length;
        const masks: string[] = [];
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(250);
            expect(Screen.read().status().mode).toBe('enr-leg msg');
            masks.push(Screen.read().mask().split('\n')[6].slice(14, 17));
        }

        expect(writesSince(unit, MSG, mark)).toEqual([0, 0, 0, 0]);
        expect(unit.env.sim.get(MSG, 'bool')).toBe(0);
        expect(masks.every(m => m === 'III' || m === 'FFF')).toBe(true); // msg shows lit, flashing while unread
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(1);
    }, 30_000);

    it('a stuck WPT lamp', async () => {
        const unit = await enRoute(failed('wptDriver'));
        const mark = unit.env.sim.writes.length;

        await vi.advanceTimersByTimeAsync(2000);

        expect(writesSince(unit, WPT, mark)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    }, 30_000);

    describe('the approach lamps (the self-test is mode 3, en route 0)', () => {
        it('a burnt ARM bulb: 2 during the self-test', async () => {
            const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('armBulb')});

            expect(unit.env.sim.get(MODE, 'enum')).toBe(2);
        }, 30_000);

        it('an ACTV wiring fault: 1 during the self-test', async () => {
            const unit = await bootToSelfTest({panelXml: PANEL, storage: failed('actvWiring')});

            expect(unit.env.sim.get(MODE, 'enum')).toBe(1);
        }, 30_000);

        it('a stuck ARM driver: 1 en route', async () => {
            const unit = await enRoute(failed('armDriver'));

            expect(unit.env.sim.get(MODE, 'enum')).toBe(1);
        }, 30_000);

        it('a stuck ACTV driver: 2 en route', async () => {
            const unit = await enRoute(failed('actvDriver'));

            expect(unit.env.sim.get(MODE, 'enum')).toBe(2);
        }, 30_000);
    });

    // The stuck driver runs on the unit's own supply, so the lamp goes dark with the unit (failures.md, "Annunciators")
    it('a stuck lamp goes dark with the unit', async () => {
        const unit = await enRoute(failed('wptDriver'));
        expect(unit.env.sim.get(WPT, 'bool')).toBe(1); // Precondition: stuck on

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.env.sim.lastWrite(WPT)?.value).toBe(0);

        await unit.panel.powerOn();
        await unit.panel.approveSelfTest();
        await settle(unit);
        expect(unit.props.memory.navPage.waypointAlert).toBe(false);
        expect(unit.env.sim.get(WPT, 'bool')).toBe(1);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Review Focus 1: ARM reaches the aircraft only through GPS APPROACH MODE, which the option gates
    it('an ARM failure without WriteGPSSimVars', async () => {
        const unit = await enRoute(failed('armDriver'));
        const sim = unit.env.sim;
        expect(sim.get(MODE, 'enum')).toBe(1); // Precondition

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(500); // The next poll of SimVarSync
        const mark = sim.writes.length;
        await vi.advanceTimersByTimeAsync(3000);
        expect(writesSince(unit, MODE, mark)).toEqual([]);
        expect(unit.errors).toEqual([]);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.get(MODE, 'enum')).toBe(1);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('nothing failed: the lamps write today\'s values', async () => {
        const selfTest = await bootToSelfTest({panelXml: PANEL});
        const sim = selfTest.env.sim;
        expect([sim.get(MSG, 'bool'), sim.get(WPT, 'bool'), sim.get(MODE, 'enum')]).toEqual([1, 1, 3]);
    }, 30_000);

    it('nothing failed: the lamps write today\'s values en route', async () => {
        const unit = await enRoute();
        const sim = unit.env.sim;
        expect(messages(unit)).toEqual([]);
        expect([sim.get(MSG, 'bool'), sim.get(WPT, 'bool'), sim.get(MODE, 'enum')]).toEqual([0, 0, 0]);
    }, 30_000);
});
