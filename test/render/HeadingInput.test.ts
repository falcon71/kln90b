import {describe, expect, it, vi} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../harness/boot';
import {storedSetting} from '../harness/storage';
import {Screen} from '../harness/render/screen';
import {recordMap} from '../harness/render/mapRecorder';
import {showSuperNav5, SuperNav5} from '../harness/render/superNav5';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {standardRoute} from '../harness/fixtures';
import {courseDeg, pointBefore, pointFrom} from '../harness/flight/geo';
import {HEADING_INPUT, panelXml} from '../harness/panelXml';
import {mount} from '../harness/render/mount';
import {SensorsIn} from '../../kln90b/Sensors';
import {Interconnect} from '../../kln90b/Interconnect';
import {MessageHandler} from '../../kln90b/data/MessageHandler';
import {ExactMeasurement} from '../../kln90b/GpsMeasurement';
import {Cal3Page} from '../../kln90b/pages/left/Cal3Page';

// Public contract (LVars.ts, the wiki page panel.xml customization): L:KLN90B_HeadingInput is the runtime override of
// Input.HeadingInput, synced like L:KLN90B_ObsSource (SimVarSync.test.ts)
describe('L:KLN90B_HeadingInput (public contract)', () => {
    it('switches the heading input on and off at runtime (#368)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.headingGyro).toBeNull(); // Precondition: the default panel.xml has no heading input

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.planeSettings.input.headingInput).toBe(true);
        expect(unit.props.sensors.in.headingGyro).toBe(123);

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 0);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(unit.props.sensors.in.headingGyro).toBeNull();
    });

    // The roll command follows the runtime override: with the input switched on, the unit banks toward the leg (#143)
    it('gives roll steering once switched on at runtime (2-69, #143)', async () => {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(onLeg, abc);
        const unit = await bootOnStandardRoute({magvar: 0});
        await moveAircraft(unit, pointFrom(onLeg, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0); // Precondition: no heading input

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeGreaterThan(0); // left bank, toward the leg
    });
});

// #405: an aircraft with its own gyro simulation names the heading SimVar in Input.HeadingInput instead of true. The
// unit reads that one and not PLANE HEADING DEGREES GYRO, also after L:KLN90B_HeadingInput switched the input off and on
describe('Input.HeadingInput with a SimVar (public contract, #405)', () => {
    it('reads the heading from the named SimVar', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.HeadingInput': 'L:MY_GYRO_HEADING'})});
        await settle(unit);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        unit.env.sim.set('L:MY_GYRO_HEADING', 'degrees', 77);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.headingGyro).toBe(77);
    });

    it('keeps the named SimVar when the input is switched off and on at runtime (#368)', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.HeadingInput': 'L:MY_GYRO_HEADING'})});
        await settle(unit);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        unit.env.sim.set('L:MY_GYRO_HEADING', 'degrees', 77);
        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 0);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.headingGyro).toBeNull();

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.headingGyro).toBe(77);
    });

    it('still reads PLANE HEADING DEGREES GYRO for true', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.HeadingInput': true})});
        await settle(unit);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        unit.env.sim.set('L:MY_GYRO_HEADING', 'degrees', 77);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.headingGyro).toBe(123);
    });
});

// #368: a stored HDG up without a heading input is drawn north up, and the stored setting is kept for when the input
// returns (an aircraft may switch the input on shortly after loading). North up draws the plane symbol "$" at the
// aircraft, the rotated orientations "#" (Nav5Page.drawPlaneIcon). Characterization of the maintainer's ruling.
describe('HDG up without a heading input (characterization)', () => {
    it('NAV 5 shows N^, draws north up and keeps the stored HDG up (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {nav5MapOrientation: 3}});
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('N^  ');
        expect(map.drawn).toContain('icon $ AC');
        expect(storedSetting(unit, 'nav5MapOrientation')).toBe(3);
    });

    it('NAV 5 is HDG up again once the input is on, at the next page build (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {nav5MapOrientation: 3}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 90);
        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(map.drawn).toContain('icon # AC');
        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('090°');
    });

    it('Super NAV 5 draws north up and keeps the stored HDG up (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {superNav5MapOrientation: 3}});
        await showSuperNav5(unit);
        await vi.advanceTimersByTimeAsync(2000);

        expect(map.drawn).toContain('icon $ AC');
        expect(storedSetting(unit, 'superNav5MapOrientation')).toBe(3);
    });

    // The orientation field of the right menu is built from the stored setting; the menu shows only while the right
    // cursor is on (SuperNav5Page.test.ts). Without the heading input its choices stop at the track up glyph, so a raw 3
    // would select nothing
    it('Super NAV 5 shows N^ in the orientation field and keeps the stored HDG up (characterization, #368)', async () => {
        const unit = await bootOnStandardRoute({storage: {superNav5MapOrientation: 3}});
        await showSuperNav5(unit);
        await unit.panel.cursor('R');

        expect(SuperNav5.read().right![3].slice(-3)).toBe(' N^');
        expect(storedSetting(unit, 'superNav5MapOrientation')).toBe(3);
    });
});

// A page or selector can be built before the first calculation tick: at a force-ready start the main page is. It must
// see the heading input already, not "no heading" until the tick (#458)
describe('the heading input before the first calculation tick', () => {
    async function freshSensors() {
        const unit = await bootUnit({panelXml: panelXml(HEADING_INPUT)});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        const p = unit.props;
        const sensorsIn = new SensorsIn(new EventBus(), p.userSettings, p.planeSettings, new Interconnect(p.planeSettings, p.failures),
            new MessageHandler(), new ExactMeasurement(), p.failures);
        return {unit, sensorsIn};
    }

    it('SensorsIn has the heading from its construction on', async () => {
        const {sensorsIn} = await freshSensors();

        expect(sensorsIn.isHeadingAvailable()).toBe(true);
        expect(sensorsIn.headingGyro).toBe(123);
    });

    it('CAL 3 built then shows the variant with a heading input, line three blank', async () => {
        const {unit, sensorsIn} = await freshSensors();
        const page = new Cal3Page({...unit.props, sensors: {...unit.props.sensors, in: sensorsIn}} as typeof unit.props);

        const rows = mount(page).text().split('\n');
        expect(rows[1]).toMatch(/^TAS/); // Precondition: the rows are those of the page
        expect(rows[2]).toBe(''); // Not "HDG    000°"
    });
});
