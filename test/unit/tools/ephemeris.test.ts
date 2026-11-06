import {describe, expect, it} from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    buildEphemeris,
    EPHEMERIS_SOURCE_DIR,
    generateEphemerisJson,
    parseRinexNavigation,
    parseSatelliteMetadata,
    serializeEphemeris,
} from '../../../tools/ephemeris/ephemeris.mjs';

const RINEX_HEADER = [
    '     2              NAVIGATION DATA                         RINEX VERSION / TYPE',
    '                                                            END OF HEADER',
];

const RECORD_PRN_1 = [
    ' 1 22  7  1  0  0  0.0 0.330457929522D-03-0.761701812735D-11 0.000000000000D+00',
    '    0.830000000000D+02-0.534375000000D+01 0.420160358508D-08-0.474549652521D+00',
    '   -0.260770320892D-07 0.120230624452D-01 0.961124897003D-06 0.515366026688D+04',
    '    0.432000000000D+06-0.130385160446D-07 0.199246160632D+01 0.180676579475D-06',
    '    0.987825640251D+00 0.378406250000D+03 0.927216062088D+00-0.833641867387D-08',
    '    0.106075847056D-09 0.100000000000D+01 0.221600000000D+04 0.000000000000D+00',
    '    0.200000000000D+01 0.000000000000D+00 0.512227416039D-08 0.840000000000D+02',
    '    0.424818000000D+06',
];

const RECORD_PRN_7 = [
    ' 7 22  7  1  2  0  0.0-0.100000000000D-03 0.100000000000D-11 0.000000000000D+00',
    ...RECORD_PRN_1.slice(1, 7),
    '    0.400004000000D+06',
];

describe('parseRinexNavigation', () => {
    const records = parseRinexNavigation([...RINEX_HEADER, ...RECORD_PRN_1, ...RECORD_PRN_7].join('\r\n') + '\r\n');

    it('returns the PRNs in file order with their epochs in UTC', () => {
        expect(records.map(r => r.prn)).toEqual([1, 7]);
        expect(records[0].epoch.toISOString()).toBe('2022-07-01T00:00:00.000Z');
        expect(records[1].epoch.toISOString()).toBe('2022-07-01T02:00:00.000Z');
    });

    it('reads D exponents, negative values and the two-digit year', () => {
        const e = records[0].entry;
        expect(e.epoch).toEqual({year: 22, month: 7, day: 1, hour: 0, minute: 0, second: 0});
        expect(e.svClock).toEqual({bias: 0.000330457929522, drift: -7.61701812735e-12, driftRate: 0});
        expect(e.crs).toBe(-5.34375);
        expect(e.sqrtA).toBe(5153.66026688);
        expect(e.omegaLDot).toBe(-8.33641867387e-9);
        expect(e.gpsWeekNumber).toBe(2216);
        expect(e.iodeIssueEphemeris).toBe(83);
        expect(e.iodeIssueClock).toBe(84);
        expect(e.tgd).toBe(5.12227416039e-9);
        expect(e.transmissionTimeOfMessage).toBe(424818);
    });

    it('reads a last line with only one field', () => {
        expect(records[1].entry.transmissionTimeOfMessage).toBe(400004);
        expect(records[1].entry.svClock.bias).toBe(-0.0001);
    });

    it('truncates the epoch seconds', () => {
        const line = ' 1 22  7  1  0  0 30.9' + RECORD_PRN_1[0].substring(22);
        const r = parseRinexNavigation([...RINEX_HEADER, line, ...RECORD_PRN_1.slice(1)].join('\n'));
        expect(r[0].entry.epoch.second).toBe(30);
    });

    it('rejects a file whose records are cut off', () => {
        expect(() => parseRinexNavigation([...RINEX_HEADER, ...RECORD_PRN_1.slice(0, 5)].join('\n'))).toThrow();
    });

    it('rejects a file without a header end', () => {
        expect(() => parseRinexNavigation(RECORD_PRN_1.join('\n'))).toThrow(/END OF HEADER/);
    });
});

const SNX = [
    '+SATELLITE/IDENTIFIER',
    '*SVN_ COSPAR ID SatCat Block__________ Comment',
    ' G013 1989-044A  20061 GPS-IIA         comment',
    ' G061 2004-045A  28474 GPS-IIR-B       comment',
    ' R701 2000-000A  00000 GLONASS         other system',
    ' G099 2030-001A',
    '-SATELLITE/IDENTIFIER',
    '+SATELLITE/PRN',
    ' G013 1989:161:00000 2004:134:79200 G02 ',
    ' G061 2004:311:79200 0000:000:00000 G02 ',
    ' R701 2000:001:00000 0000:000:00000 R01 ',
    ' G099 2020:001:00000 0000:000:00000 G03 ',
    '-SATELLITE/PRN',
].join('\n');

describe('parseSatelliteMetadata', () => {
    const meta = parseSatelliteMetadata(SNX);

    it('gives the block of the SVN that carried the PRN at that time', () => {
        expect(meta.blockOf(2, new Date(Date.UTC(2000, 0, 1)))).toBe('GPS-IIA');
        expect(meta.blockOf(2, new Date(Date.UTC(2022, 6, 1)))).toBe('GPS-IIR-B');
    });

    it('treats ValidFrom as inclusive and ValidTo as exclusive', () => {
        const handover = Date.UTC(2004, 0, 1) + 133 * 86400000 + 79200 * 1000;
        expect(meta.blockOf(2, new Date(handover - 1))).toBe('GPS-IIA');
        expect(() => meta.blockOf(2, new Date(handover))).toThrow(/PRN 2/);
        const next = Date.UTC(2004, 0, 1) + 310 * 86400000 + 79200 * 1000;
        expect(() => meta.blockOf(2, new Date(next - 1))).toThrow(/PRN 2/);
        expect(meta.blockOf(2, new Date(next))).toBe('GPS-IIR-B');
    });

    it('treats 0000:000:00000 as open-ended', () => {
        expect(meta.blockOf(2, new Date(Date.UTC(2090, 0, 1)))).toBe('GPS-IIR-B');
    });

    it('throws for a time no SVN covers', () => {
        expect(() => meta.blockOf(2, new Date(Date.UTC(1980, 0, 1)))).toThrow();
    });

    it('ignores other constellations: a GLONASS entry never answers for a GPS PRN', () => {
        expect(() => meta.blockOf(1, new Date(Date.UTC(2022, 0, 1)))).toThrow(/PRN 1/);
    });

    it('throws when the SVN has no block', () => {
        expect(() => meta.blockOf(3, new Date(Date.UTC(2022, 0, 1)))).toThrow(/G099/);
    });
});

const SOURCES = path.resolve(__dirname, '../../..', EPHEMERIS_SOURCE_DIR);
const RINEX = fs.readFileSync(path.join(SOURCES, 'brdc1820.22n'), 'utf8');
const SNX_FILE = fs.readFileSync(path.join(SOURCES, 'igs_satellite_metadata.snx'), 'utf8');

describe('buildEphemeris on the committed sources', () => {
    const e = buildEphemeris(RINEX, SNX_FILE);

    it('has the 32 PRNs in ascending order', () => {
        expect(Object.keys(e)).toEqual(Array.from({length: 32}, (_, i) => String(i + 1)));
    });

    it('keeps the first record of PRN 1 as the shipped file had it, plus the block', () => {
        expect(e['1']).toEqual({
            epoch: {year: 22, month: 7, day: 1, hour: 0, minute: 0, second: 0},
            svClock: {bias: 0.000330457929522, drift: -7.61701812735e-12, driftRate: 0},
            iodeIssueEphemeris: 83, crs: -5.34375, deltaN: 4.20160358508e-09, m0: -0.474549652521,
            cuc: -2.60770320892e-08, eEccentricity: 0.0120230624452, cus: 9.61124897003e-07, sqrtA: 5153.66026688,
            toeTimeEphemeris: 432000, cic: -1.30385160446e-08, omegaL: 1.99246160632, cis: 1.80676579475e-07,
            i0: 0.987825640251, crc: 378.40625, omegaS: 0.927216062088, omegaLDot: -8.33641867387e-09,
            idot: 1.06075847056e-10, codesOnL2Channel: 1, gpsWeekNumber: 2216, l2PDataFlag: 0, svAccuracy: 2,
            svHealth: 0, tgd: 5.12227416039e-09, iodeIssueClock: 83, transmissionTimeOfMessage: 424818,
            block: 'GPS-IIF',
        });
    });

    it.each([[2, 'GPS-IIR-B'], [4, 'GPS-IIIA'], [5, 'GPS-IIR-M'], [13, 'GPS-IIR-A'], [28, 'GPS-IIR-A']])(
        'PRN %i is a %s', (prn, block) => {
            expect(e[String(prn)].block).toBe(block);
        });

    it('serializes with two-space indentation and a final newline', () => {
        const text = serializeEphemeris(e);
        expect(text.endsWith('}\n')).toBe(true);
        expect(text.startsWith('{\n  "1": {\n    "epoch"')).toBe(true);
        expect(JSON.parse(text)).toEqual(e);
    });
});

describe('buildEphemeris failures', () => {
    it('names the PRN whose SVN is missing from the metadata', () => {
        const without = SNX_FILE.split('\n').filter(l => !/^ G\d+ \S+ \S+ G05 /.test(l)).join('\n');
        expect(without.length).toBeLessThan(SNX_FILE.length);
        expect(() => buildEphemeris(RINEX, without)).toThrow(/PRN 5\b/);
    });
});

describe('generateEphemerisJson', () => {
    it('reads the committed sources', () => {
        expect(JSON.parse(generateEphemerisJson(SOURCES))['1'].block).toBe('GPS-IIF');
    });

    it('throws unless there is exactly one RINEX file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephemeris-'));
        try {
            fs.writeFileSync(path.join(dir, 'igs_satellite_metadata.snx'), SNX_FILE);
            fs.writeFileSync(path.join(dir, 'a.22n'), RINEX);
            fs.writeFileSync(path.join(dir, 'b.22n'), RINEX);
            expect(() => generateEphemerisJson(dir)).toThrow(/exactly one/);
            fs.rmSync(path.join(dir, 'a.22n'));
            fs.rmSync(path.join(dir, 'b.22n'));
            expect(() => generateEphemerisJson(dir)).toThrow(/exactly one/);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});
