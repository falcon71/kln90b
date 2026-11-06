import {describe, expect, it} from 'vitest';
import {EPHEMERIS_SOURCE_DIR, generateEphemerisJson} from '../../tools/ephemeris/ephemeris.mjs';
import {KNOWN_BLOCKS} from '../../kln90b/GpsSignal';

// #467: a regenerated ephemeris can bring a block the signal model has no offset for. This fails then, so the list is
// extended on purpose and not overlooked
describe('the blocks of the generated ephemeris (#467)', () => {
    it('are all known to the signal model', () => {
        const ephemeris = JSON.parse(generateEphemerisJson(EPHEMERIS_SOURCE_DIR)) as Record<string, { block?: string }>;
        const unknown = Object.entries(ephemeris)
            .filter(([, entry]) => entry.block === undefined || !KNOWN_BLOCKS.includes(entry.block))
            .map(([prn, entry]) => `PRN ${prn}: ${entry.block}`);
        expect(unknown).toEqual([]);
    });
});
