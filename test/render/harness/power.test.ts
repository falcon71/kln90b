import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, vor} from '../../harness/navdata/builders';
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
    const kaaa = airport('KAAA', 47.0, 8.0);
    const abc = vor('ABC', 47.5, 8.9);

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
        const unit = await bootUnit({
            panelXml: '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><VFROnly>true</VFROnly></Instrument></PlaneHTMLConfig>',
        });
        await unit.panel.powerCycle();

        await expect(unit.panel.approveSelfTest()).rejects.toThrow(/VFR only page[^]*FOR VFR USE ONLY/);
    });
});
