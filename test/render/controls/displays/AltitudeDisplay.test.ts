import {describe, expect, it} from 'vitest';
import {AltitudeDisplay, ElevationDisplay} from '../../../../kln90b/controls/displays/AltitudeDisplay';
import {mount} from '../../../harness/render/mount';
import {UiElement} from '../../../../kln90b/pages/Page';

/** The cells of a display after a display tick */
function shown(el: UiElement): string {
    const m = mount(el);
    m.tick();
    return m.text();
}

describe('AltitudeDisplay', () => {
    // 3-32, figure 3-104 (MSA 3300ft, ESA 5500ft) and a photo of a real unit (TCAS,_GPS_and_Altitude_Alerter, MSA
    // 12300FT): five cells, right-aligned
    it('shows an altitude right-aligned in five cells (3-32)', () => {
        expect(shown(new AltitudeDisplay(3300))).toBe(' 3300');
        expect(shown(new AltitudeDisplay(12300))).toBe('12300');
    });

    // 5-43: the pressure and the density altitude are shown to the nearest 100 ft (figure 5-132: PRS 6500ft)
    it('rounds to the nearest 100 ft (5-43)', () => {
        expect(shown(new AltitudeDisplay(6449))).toBe(' 6400');
        expect(shown(new AltitudeDisplay(6451))).toBe(' 6500');
    });

    // 3-33: dashes where the MSA is not defined
    it('shows dashes without a value (3-33)', () => {
        expect(shown(new AltitudeDisplay(null))).toBe('-----');
    });
});

describe('ElevationDisplay', () => {
    // 3-43: the airport elevation is rounded to 10 ft
    it('rounds the elevation to the nearest 10 ft (3-43)', () => {
        expect(shown(new ElevationDisplay(1234))).toBe(' 1230');
        expect(shown(new ElevationDisplay(1236))).toBe(' 1240');
    });
});

describe('AltitudeDisplay (characterization)', () => {
    it('characterization: altitudes above 65600 ft show 65600', () => {
        expect(shown(new AltitudeDisplay(70000))).toBe('65600');
    });

    // Whether the real unit shows a minus below sea level is open, so what the code draws is only held here
    it('characterization: an altitude or an elevation below sea level shows 0', () => {
        expect(shown(new AltitudeDisplay(-500))).toBe('    0');
        expect(shown(new ElevationDisplay(-240))).toBe('    0');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new AltitudeDisplay(null);
        const m = mount(d);
        d.altitude = 3300;
        expect(m.text()).toBe('-----');
        m.tick();
        expect(m.text()).toBe(' 3300');
    });
});
