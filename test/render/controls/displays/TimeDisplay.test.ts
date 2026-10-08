import {describe, expect, it} from 'vitest';
import {TimeDisplay} from '../../../../kln90b/controls/displays/TimeDisplay';
import {TimeStamp} from '../../../../kln90b/data/Time';
import {mount} from '../../../harness/render/mount';

/** The five cells of a time of day after a display tick */
function shown(time: TimeStamp | null): string {
    const m = mount(new TimeDisplay(time));
    m.tick();
    return m.text();
}

describe('TimeDisplay', () => {
    // 4-12, figures 4-47 and 4-48 (ETA 09:23, 15:23) and 5-15, figure 5-49 (RISE 06:24): hours and minutes, both with
    // two digits
    it('shows hours and minutes with two digits each (4-12, 5-15)', () => {
        expect(shown(TimeStamp.createTime(9, 23))).toBe('09:23');
        expect(shown(TimeStamp.createTime(15, 23))).toBe('15:23');
    });

    // 4-12: the same two digits for the hour after midnight
    it('shows the hour after midnight as 00 (4-12)', () => {
        expect(shown(TimeStamp.createTime(0, 5))).toBe('00:05');
    });
});

describe('TimeDisplay (characterization)', () => {
    it('characterization: the seconds are dropped, not rounded', () => {
        expect(shown(TimeStamp.create(Date.UTC(2026, 9, 8, 15, 23, 59)))).toBe('15:23');
    });

    it('characterization: a hidden display shows nothing, and shows its value again once visible', () => {
        const d = new TimeDisplay(TimeStamp.createTime(9, 23));
        const m = mount(d);
        d.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
        d.isVisible = true;
        m.tick();
        expect(m.text()).toBe('09:23');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new TimeDisplay(null);
        const m = mount(d);
        d.time = TimeStamp.createTime(9, 23);
        expect(m.text()).toBe('--:--');
        m.tick();
        expect(m.text()).toBe('09:23');
    });
});
