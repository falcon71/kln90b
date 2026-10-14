import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../harness/boot';
import {HEADING_INPUT, panelXml} from '../harness/panelXml';
import {storedSetting} from '../harness/storage';
import {Screen} from '../harness/render/screen';
import {recordMap} from '../harness/render/mapRecorder';
import {showSuperNav5, SuperNav5} from '../harness/render/superNav5';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {standardRoute} from '../harness/fixtures';

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
