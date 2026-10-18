import {describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {AltAlert} from '../../../kln90b/services/AltAlert';
import {VolatileMemory} from '../../../kln90b/data/VolatileMemory';
import {KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {Sensors} from '../../../kln90b/Sensors';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';

// 3-55 to 3-57: altitude alerting. ALERT ON/OFF and WARN are set on the ALT page and kept in the user settings
// altAlertEnabled and altAlertWarn (#259), SEL on NAV 4
// (memory.navPage.nav4SelectedAltitude), IND is the indicated altitude. Tones: three short 1000 ft before SEL, two short
// on reaching it, four short on a deviation of more than WARN, which is armed only by the "reached" alert (3-56).
// The service is ticked once per second; the test calls tick() once per altitude.

interface Rig {
    alert: AltAlert;
    /** The tone counts requested so far, one entry per alert */
    tones: number[];
    /** Sets IND and runs one calculation tick */
    at: (indFt: number | null) => void;
    memory: { navPage: { nav4SelectedAltitude: number } };
    /** The ALT page's ALERT and WARN (#259) */
    userSettings: KLN90BUserSettings;
}

function rig(opts: { sel: number, warn?: number, alertEnabled?: boolean, installed?: boolean }): Rig {
    const memory = {
        navPage: {nav4SelectedAltitude: opts.sel},
    };
    // #259: ALERT and WARN are user settings. The rig's own bus keeps the tests of this file apart
    const userSettings = new KLN90BUserSettings(new EventBus());
    userSettings.getSetting('altAlertEnabled').set(opts.alertEnabled ?? true);
    userSettings.getSetting('altAlertWarn').set(opts.warn ?? 300);
    let ind: number | null = null;
    const tones: number[] = [];
    const sensors = {
        in: {airdata: {getIndicatedAlt: () => ind}},
        out: {audioGenerator: {shortBeeps: (n: number) => tones.push(n)}},
    } as unknown as Sensors;
    const settings = {output: {altitudeAlertEnabled: opts.installed ?? true}} as unknown as KLN90PlaneSettings;
    const alert = new AltAlert(memory as unknown as VolatileMemory, settings, sensors, userSettings);
    return {
        alert, tones, memory, userSettings, at: (v) => {
            ind = v;
            alert.tick();
        },
    };
}

describe('AltAlert', () => {
    // 3-56: climbing to SEL 5000 ft: three tones at 4000 ft, nothing on the way up to 5000, two tones at 5000
    it('gives three tones 1000 ft before SEL and two on reaching it, climbing (3-56)', () => {
        const r = rig({sel: 5000});
        r.at(3000);
        r.at(3900);
        expect(r.tones).toEqual([]);
        r.at(4000);
        expect(r.tones).toEqual([3]);
        r.at(4500);
        r.at(4900);
        expect(r.tones).toEqual([3]);
        r.at(5000);
        expect(r.tones).toEqual([3, 2]);
    });

    // 3-56: the same descending onto SEL 5000 ft from above
    it('gives three tones 1000 ft before SEL and two on reaching it, descending (3-56)', () => {
        const r = rig({sel: 5000});
        r.at(7000);
        r.at(6100);
        expect(r.tones).toEqual([]);
        r.at(6000);
        r.at(5100);
        r.at(5000);
        expect(r.tones).toEqual([3, 2]);
    });

    // characterization: the service rounds IND to 100 ft before comparing, also for an air data input that is more
    // precise than an encoder, so 4960 ft counts as 5000.
    it('counts SEL as reached when IND rounds to it (characterization)', () => {
        const r = rig({sel: 5000});
        r.at(4000);
        r.at(4960);
        expect(r.tones).toEqual([3, 2]);
    });

    // 3-56: after "reached", leaving SEL by more than WARN (300 ft) gives four tones; 300 ft exactly is not more
    it('gives four tones on a deviation of more than WARN after reaching SEL (3-56)', () => {
        const r = rig({sel: 5000, warn: 300});
        r.at(4000);
        r.at(5000);
        r.at(5300);
        expect(r.tones).toEqual([3, 2]);
        r.at(5400);
        expect(r.tones).toEqual([3, 2, 4]);
    });

    it('gives four tones on a deviation below SEL with WARN 500 (3-56)', () => {
        const r = rig({sel: 5000, warn: 500});
        r.at(4000);
        r.at(5000);
        r.at(4500);
        expect(r.tones).toEqual([3, 2]);
        r.at(4400);
        expect(r.tones).toEqual([3, 2, 4]);
    });

    // 3-56 NOTE: the deviation alert is armed only by the "reached" alert. Climbing to 4800 and turning back down gives
    // the three tones and nothing else.
    it('gives no deviation tones before SEL was reached (3-56)', () => {
        const r = rig({sel: 5000, warn: 300});
        r.at(3000);
        r.at(4800);
        r.at(4000);
        r.at(3000);
        expect(r.tones).toEqual([3]);
    });

    // 3-56: a new SEL has not been reached, so it arms no deviation alert: at the old SEL nothing sounds, and the new SEL
    // gets its own three and two tones
    it('re-arms for a new SEL without a deviation alert (3-56)', () => {
        const r = rig({sel: 5000});
        r.at(4000);
        r.at(5000);
        r.memory.navPage.nav4SelectedAltitude = 8000;
        r.at(5000);
        expect(r.tones).toEqual([3, 2]);
        r.at(7000);
        r.at(8000);
        expect(r.tones).toEqual([3, 2, 3, 2]);
    });

    // 3-55: ALERT OFF on the ALT page
    it('stays silent with ALERT OFF (3-55)', () => {
        const r = rig({sel: 5000, alertEnabled: false});
        r.at(4000);
        r.at(5000);
        r.at(6000);
        expect(r.tones).toEqual([]);
    });

    // 3-56: the alert needs an altitude input. 3-57: the installation can disable the feature.
    // Without an input, SEL 500 is chosen so that a missing null check (which reads IND as 0, inside the window)
    // would sound.
    it('stays silent without an altitude input (3-56)', () => {
        const r = rig({sel: 500});
        r.at(null);
        r.at(null);
        expect(r.tones).toEqual([]);
    });

    it('stays silent when the installation disables it (3-57)', () => {
        const r = rig({sel: 5000, installed: false});
        r.at(4000);
        r.at(5000);
        expect(r.tones).toEqual([]);
    });

    // characterization: after a deviation the unit counts as approaching again, so coming back to SEL gives two tones
    // again; leaving the 1000 ft window re-arms the three tones. The manual does not say what follows a deviation.
    it('gives two tones again on returning after a deviation, three after leaving the 1000 ft window (characterization)', () => {
        const r = rig({sel: 5000, warn: 300});
        r.at(4000);
        r.at(5000);
        r.at(5400);
        r.at(5000);
        expect(r.tones).toEqual([3, 2, 4, 2]);
        r.at(5400);
        r.at(6100);
        r.at(6000);
        expect(r.tones).toEqual([3, 2, 4, 2, 4, 3]);
    });

    // characterization: ALERT ON while already within 1000 ft of SEL gives the three tones at once
    it('gives three tones at once when switched on within 1000 ft of SEL (characterization)', () => {
        const r = rig({sel: 5000, alertEnabled: false});
        r.at(4500);
        r.userSettings.getSetting('altAlertEnabled').set(true);
        r.at(4500);
        expect(r.tones).toEqual([3]);
    });
});
