import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, vor} from '../../harness/navdata/builders';

// Contract source: this harness (test/harness/fixtures.ts, defaultNavdata); no manual page
describe('default navdata (harness)', () => {
    it.each([['VOR  '], ['NDB  '], ['INT  '], ['APT 1']])('a world without the type shows no NO ... WPTS on the %s page', async page => {
        const unit = await bootUnit({facilities: page === 'APT 1' ? [vor('ABC', 47.1, 8.0)] : [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('R', page);
        expect(Screen.read().status().mode).toBe('enr-leg msg');
    });

    it('keeps NO SUP WPTS, which a real unit without user waypoints shows', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.selectPage('R', 'SUP  ');
        expect(Screen.read().status().mode).toBe('NO SUP WPTS');
    });

    it('defaultNavdata: false boots the bare world', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)], defaultNavdata: false});
        await unit.panel.selectPage('R', 'INT  ');
        expect(Screen.read().status().mode).toBe('NO INT WPTS');
    });

    it('opens the APT pages on the first test airport, not the default one', async () => {
        const unit = await bootUnit({facilities: [airport('ZZIN', 47.0, 8.0), airport('KAAA', 47.1, 8.0)]});
        await unit.panel.selectPage('R', 'APT 1');
        expect(Screen.read().rows('R')[0]).toBe(' KAAA      ');
    });

    it('refuses a test facility with a default ident', async () => {
        await expect(bootUnit({facilities: [vor('ZZV', 47.0, 8.0)]})).rejects.toThrow(/ZZV is an ident of the default navdata/);
    });
});
