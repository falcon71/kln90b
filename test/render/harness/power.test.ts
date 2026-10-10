import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {standardRoute} from '../../harness/fixtures';
import {LEG_OBS_SWITCH, panelXml, VFR_ONLY} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

describe('FrontPanel power helpers (harness)', () => {
    // After boot every power-on runs the welcome page and the self-test, also with the engine already running (WelcomePage.tsx)
    it('brings an engine-running unit to a new main page after a power cycle', async () => {
        const unit = await bootUnit();
        const bootPage = unit.props.pageManager.getCurrentPage();

        await unit.panel.powerCycle();
        expect(Screen.read().text().split('\n')[6]).toBe(' SELF TEST IN PROGRESS ');
        await unit.panel.approveSelfTest();

        const page = unit.props.pageManager.getCurrentPage();
        expect(page).toBeInstanceOf(MainPage);
        expect(page).not.toBe(bootPage);
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(unit.errors).toEqual([]);
    });

    it('brings a cold and dark unit to its main page', async () => {
        const unit = await bootUnit({engineRunning: false});

        await unit.panel.powerOn();
        await unit.panel.approveSelfTest();

        expect(unit.props.pageManager.getCurrentPage()).toBeInstanceOf(MainPage);
        expect(Screen.read().status()).toEqual({left: 'NAV 2', mode: 'enr-leg msg', right: 'SUP'});
    });

    it('powers off to a blank screen', async () => {
        const unit = await bootUnit();

        await unit.panel.powerOff();

        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => ' '.repeat(23)).join('\n'));
    });

    it('times out with the screen when the unit never reaches the self-test', async () => {
        const unit = await bootUnit();

        await expect(unit.panel.approveSelfTest()).rejects.toThrow(/APPROVE\? did not show within 30 s/);
    });
});

describe('FrontPanel.obsMode (harness)', () => {
    const {kaaa, abc} = standardRoute();

    it('enters ENR-OBS from MOD 2', async () => {
        const unit = await bootUnit({facilities: [kaaa, abc], storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
    });
});

describe('FrontPanel.approveSelfTest on other pages (harness)', () => {
    // An instrument that is not rated for IFR asks for its own acknowledgement after APPROVE? (SelfTestRightPage.approve)
    it('throws with the screen at the VFR only page', async () => {
        const unit = await bootUnit({panelXml: panelXml(VFR_ONLY)});
        await unit.panel.powerCycle();

        await expect(unit.panel.approveSelfTest()).rejects.toThrow(/VFR only page[^]*FOR VFR USE ONLY/);
    });
});

describe('FrontPanel power cycle time and the OBS warning (harness)', () => {
    it('keeps the unit off for the seconds it is given', async () => {
        const unit = await bootUnit();
        const t0 = Date.now();

        await unit.panel.powerCycle();
        const byDefault = Date.now() - t0;
        await unit.panel.approveSelfTest();
        const t1 = Date.now();
        await unit.panel.powerCycle({offSeconds: 5});

        // Two presses of one display tick each around the wait
        expect(byDefault).toBe(250 + 1000 + 250);
        expect(Date.now() - t1).toBe(250 + 5000 + 250);
    });

    // 3-7: a unit powered up with the external GPS CRS switch in OBS shows the OBS warning before the data base page. The
    // switch is a GPS OBS ACTIVE SimVar read through SimVarSync, which needs the external switch option.
    const obsUnit = async () => {
        const unit = await bootUnit({panelXml: panelXml(LEG_OBS_SWITCH)});
        unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.powerCycle();
        return unit;
    };

    it('throws with the screen at the OBS warning', async () => {
        const unit = await obsUnit();

        await expect(unit.panel.approveSelfTest()).rejects.toThrow(/starts in OBS mode[^]*SYSTEM IS IN OBS MODE/);
    });

    it('waits through the OBS warning when allowed, until the switch is back in LEG', async () => {
        const unit = await obsUnit();
        // The warning comes up about 9 s into approveSelfTest. The fake clock flips the switch well after that, and looks at
        // the screen between: a helper that gave up at the warning would throw before the flip
        let screenBeforeFlip = '';
        setTimeout(() => {
            screenBeforeFlip = Screen.read().text();
        }, 18_000);
        setTimeout(() => unit.env.sim.set('GPS OBS ACTIVE', 'bool', false), 20_000);

        await unit.panel.approveSelfTest({allowObsWarning: true});

        expect(screenBeforeFlip).toContain('SYSTEM IS IN OBS MODE');
        expect(unit.props.pageManager.getCurrentPage()).toBeInstanceOf(MainPage);
        expect(Screen.read().status().left).toBe('NAV 2');
    });
});
