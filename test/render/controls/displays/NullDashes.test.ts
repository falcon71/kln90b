import {describe, expect, it} from 'vitest';
import {FSComponent} from '@microsoft/msfs-sdk';
import {UiElement} from '../../../../kln90b/pages/Page';
import {TimeDisplay} from '../../../../kln90b/controls/displays/TimeDisplay';
import {OthFuelDisplay, TripFuelDisplay} from '../../../../kln90b/controls/displays/FuelDisplay';
import {AltitudeDisplay} from '../../../../kln90b/controls/displays/AltitudeDisplay';
import {BearingDisplay} from '../../../../kln90b/controls/displays/BearingDisplay';
import {DurationDisplay} from '../../../../kln90b/controls/displays/DurationDisplay';
import {SpeedDisplay} from '../../../../kln90b/controls/displays/SpeedDisplay';
import {LatitudeDisplay} from '../../../../kln90b/controls/displays/LatitudeDisplay';
import {LongitudeDisplay} from '../../../../kln90b/controls/displays/LongitudeDisplay';
import {Alignment, RoundedDistanceDisplay} from '../../../../kln90b/controls/displays/RoundedDistanceDisplay';
import {DistanceDisplay} from '../../../../kln90b/controls/displays/DistanceDisplay';

// The rule lives in each display, not in Text.ts: a null value renders as dashes in the cells of the value
// (CLAUDE.md, Conventions). The dash layouts are what the code draws today.
function rendered(el: UiElement): string {
    const host = document.createElement('div');
    FSComponent.render(el.render()!, host);
    return host.textContent!;
}

describe('a null value renders as dashes (characterization of the dash layouts)', () => {
    it.each([
        ['TimeDisplay', new TimeDisplay(null), '--:--'],
        ['DurationDisplay', new DurationDisplay(null), '--:--'],
        ['AltitudeDisplay', new AltitudeDisplay(null), '-----'],
        ['BearingDisplay', new BearingDisplay(null), '---°'],
        ['SpeedDisplay', new SpeedDisplay(null), '---'],
        ['LatitudeDisplay', new LatitudeDisplay(null), "- --°--.--'"],
        ['RoundedDistanceDisplay', new RoundedDistanceDisplay(Alignment.right, null), '----'],
        ['DistanceDisplay(6)', new DistanceDisplay(6, null), '----.-'],
        ['TripFuelDisplay', new TripFuelDisplay(null), '---.-'],
        ['OthFuelDisplay', new OthFuelDisplay(null), '-----'],
    ] as const)('%s', (_name, el, dashes) => {
        expect(rendered(el)).toBe(dashes);
    });
});

// The LongitudeDisplay row is not in the table above: its dashes show the bug below (#NEW-1-2)
describe('a null longitude renders as dashes (3-8)', () => {
    // 3-8, figure 3-26 (and a photo of a real unit, reference-photos-index.md, KLN90B 2.jpg): the longitude has three
    // digits of degrees and no blank after the hemisphere letter, so its dashes fill those four cells. The code draws
    // the latitude layout. The sibling is the LatitudeDisplay row of the table above (the same rendering path).
    it.fails('LongitudeDisplay shows its dashes in the cells of the three degree digits (3-8, #NEW-1-2)', () => {
        expect(rendered(new LongitudeDisplay(null))).toBe("----°--.--'");
    });
});
