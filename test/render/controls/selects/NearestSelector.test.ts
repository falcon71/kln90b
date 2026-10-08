import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {blinkCycle} from '../../../harness/render/blink';
import {Screen} from '../../../harness/render/screen';

// Every test advances twelve simulated seconds with every tick running before it starts: the 5 s default of the render
// stage times out when the machine is busy (docs/testing.md, section 6), so each test has its own timeout.
const TIMEOUT = 20_000;

// The rank of a nearest waypoint (nr n) after the identifier of the APT, VOR and NDB pages. KAAA is the nearest
// airport, 12 NM north; KBBB is farther. MSG, ENT shows the nearest airport on APT 1 (3-23).
async function nearestKaaa(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [airport('KAAA', 47.2, 8.0), airport('KBBB', 47.6, 8.0)],
        position: {lat: 47.0, lon: 8.0},
    });
    await vi.advanceTimersByTimeAsync(12000); // the nearest search runs every 10 s
    await unit.panel.msg();
    await unit.panel.ent();
    expect(Screen.read().rows('R')[0]).toBe(' KAAA  nr 1'); // precondition
    return unit;
}

/** The mask of the rank cells (nr 1) on each tick of one blink cycle */
const rankMasks = () => blinkCycle(() => Screen.read().maskRows('R')[0].slice(7, 11));

describe('nearest rank (3-22, 3-24)', () => {
    // 3-22: on a nearest page the rank flashes after the identifier
    it('flashes the rank while the cursor is off (3-22)', async () => {
        await nearestKaaa();

        expect((await rankMasks()).sort()).toEqual(['....', '....', '....', 'BBBB']);
    }, TIMEOUT);

    // 3-24: the cursor can be parked on the rank; 3-11: a field under the cursor is shown in inverse video (it may
    // flash, so a flashing phase counts as inverse too). The idle rank flashes as plain text, which is not inverse
    it('takes the cursor in inverse video (3-11, 3-24)', async () => {
        const unit = await nearestKaaa();
        await unit.panel.cursor('R');

        await unit.panel.cursorTo('R', 'nr 1');

        const masks = (await rankMasks()).map(m => m.replace(/F/g, 'I'));
        expect(masks).toEqual(['IIII', 'IIII', 'IIII', 'IIII']);
    }, TIMEOUT);

    // 3-22: the rank belongs to the nearest view only. KBBB selected by its identifier is shown without a rank
    it('shows no rank for an airport selected by its identifier (3-22)', async () => {
        const unit = await nearestKaaa();
        await unit.panel.cursor('R');

        await unit.panel.enterIdent('R', 'KBBB');

        expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
    }, TIMEOUT);
});

// The guide is silent on the cursor once the rank is gone
describe('nearest rank (characterization)', () => {
    it('skips the empty rank cells with the cursor once the airport is selected by its identifier', async () => {
        const unit = await nearestKaaa();
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KBBB');
        const cols = new Set<number>();

        for (let i = 0; i < 8; i++) {
            await unit.panel.outer('R', 1);
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15, 16]);
    }, TIMEOUT);
});
