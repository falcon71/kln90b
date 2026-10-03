import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';

describe('NAV 2 page', () => {
    it('shows radial and distance from the nearest VOR and the present position', async () => {
        await bootUnit({facilities: [vor('ABC', 47.2, 8.0, {magneticVariation: 0})], position: {lat: 47.0, lon: 8.0}});
        // The nearest VOR list searches every 10 s (NEAREST_TICK_TIME in NearestList.ts)
        await vi.advanceTimersByTimeAsync(12_000);

        const screen = Screen.read();
        expect(screen.half('L').split('\n')).toEqual([
            'PRESENT POS',
            '           ',
            'ABC  180°fr',
            '     12.0nm',
            "N 47°00.00'",
            "E 08°00.00'",
        ]);
        expect(screen.leftName()).toBe('NAV 2');
        // The snapshot also pins the SUP page and the lit MSG annunciator from the engine-running boot (docs/testing.md, limitations)
        expect(screen.dump()).toMatchInlineSnapshot(`
          "PRESENT POS| 0         
                     |           
          ABC  180°fr|CREATE NEW 
               12.0nm|WPT AT:    
          N 47°00.00'|USER POS?  
          E 08°00.00'|PRES POS?  
          NAV 2|enr-leg msg|SUP  

          .......................
          .......................
          .......................
          .......................
          .......................
          .......................
          ..............III......"
        `);
    });
});
