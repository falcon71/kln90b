import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

describe('APT 3 page (characterization)', () => {
    it('is offered for an airport without runways, with a note instead of the map (#38)', async () => {
        const kaaa = {...airport('KAAA', 47.1, 8.0), runways: []};
        const unit = await bootUnit({facilities: [kaaa]});

        await unit.panel.selectPage('R', 'APT 3');

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('APT 3');
        expect(screen.rows('R').slice(2, 5)).toEqual(['  RUNWAY   ', ' DATA NOT  ', ' AVAILABLE ']);
    });
});
