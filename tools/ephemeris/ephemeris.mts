// Generates gps_ephemeris.json from a RINEX 2 navigation file and the IGS satellite metadata (#467).
// Loaded by rollup.config.mjs through Node's type stripping: erasable syntax only, no project imports.
import fs from 'fs';
import path from 'path';

export const EPHEMERIS_SOURCE_DIR = 'ephemeris';

export interface EphemerisEntry {
    epoch: { year: number, month: number, day: number, hour: number, minute: number, second: number };
    svClock: { bias: number, drift: number, driftRate: number };
    iodeIssueEphemeris: number;
    crs: number;
    deltaN: number;
    m0: number;
    cuc: number;
    eEccentricity: number;
    cus: number;
    sqrtA: number;
    toeTimeEphemeris: number;
    cic: number;
    omegaL: number;
    cis: number;
    i0: number;
    crc: number;
    omegaS: number;
    omegaLDot: number;
    idot: number;
    codesOnL2Channel: number;
    gpsWeekNumber: number;
    l2PDataFlag: number;
    svAccuracy: number;
    svHealth: number;
    tgd: number;
    iodeIssueClock: number;
    transmissionTimeOfMessage: number;
    block: string;
}

export interface RinexRecord {
    prn: number;
    epoch: Date;
    entry: Omit<EphemerisEntry, 'block'>;
}

/** RINEX numbers use D as the exponent letter. */
function num(text: string): number {
    const value = parseFloat(text.trim().replace(/[dD]/, 'E'));
    if (isNaN(value)) {
        throw new Error(`Bad RINEX number "${text}"`);
    }
    return value;
}

/** Up to four fields of 19 characters from column 4, on a line that may be shorter than 80 columns. */
function orbitFields(line: string, count: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        result.push(num(line.substring(3 + i * 19, 3 + (i + 1) * 19)));
    }
    return result;
}

export function parseRinexNavigation(text: string): RinexRecord[] {
    const lines = text.split(/\r?\n/);
    const headerEnd = lines.findIndex(l => l.includes('END OF HEADER'));
    if (headerEnd < 0) {
        throw new Error('RINEX navigation file without END OF HEADER');
    }
    const body = lines.slice(headerEnd + 1);
    while (body.length > 0 && body[body.length - 1].trim() === '') {
        body.pop();
    }
    if (body.length % 8 !== 0) {
        throw new Error('RINEX navigation records are not 8 lines each');
    }

    const records: RinexRecord[] = [];
    for (let i = 0; i < body.length; i += 8) {
        const l = body.slice(i, i + 8);
        const prn = parseInt(l[0].substring(0, 2), 10);
        const yy = parseInt(l[0].substring(2, 5), 10);
        const month = parseInt(l[0].substring(5, 8), 10);
        const day = parseInt(l[0].substring(8, 11), 10);
        const hour = parseInt(l[0].substring(11, 14), 10);
        const minute = parseInt(l[0].substring(14, 17), 10);
        const second = Math.trunc(parseFloat(l[0].substring(17, 22)));
        const bias = num(l[0].substring(22, 41));
        const drift = num(l[0].substring(41, 60));
        const driftRate = num(l[0].substring(60, 79));
        const [iodeIssueEphemeris, crs, deltaN, m0] = orbitFields(l[1], 4);
        const [cuc, eEccentricity, cus, sqrtA] = orbitFields(l[2], 4);
        const [toeTimeEphemeris, cic, omegaL, cis] = orbitFields(l[3], 4);
        const [i0, crc, omegaS, omegaLDot] = orbitFields(l[4], 4);
        const [idot, codesOnL2Channel, gpsWeekNumber, l2PDataFlag] = orbitFields(l[5], 4);
        const [svAccuracy, svHealth, tgd, iodeIssueClock] = orbitFields(l[6], 4);
        const [transmissionTimeOfMessage] = orbitFields(l[7], 1);
        const year = yy < 80 ? 2000 + yy : 1900 + yy;
        records.push({
            prn,
            epoch: new Date(Date.UTC(year, month - 1, day, hour, minute, second)),
            entry: {
                epoch: {year: yy, month, day, hour, minute, second},
                svClock: {bias, drift, driftRate},
                iodeIssueEphemeris, crs, deltaN, m0, cuc, eEccentricity, cus, sqrtA,
                toeTimeEphemeris, cic, omegaL, cis, i0, crc, omegaS, omegaLDot, idot,
                codesOnL2Channel, gpsWeekNumber, l2PDataFlag, svAccuracy, svHealth, tgd,
                iodeIssueClock, transmissionTimeOfMessage,
            },
        });
    }
    return records;
}

interface PrnAssignment {
    svn: string;
    from: number;
    to: number; // Infinity when open-ended
}

/** YYYY:DOY:SSSSS to milliseconds since the Unix epoch. */
function sinexTime(text: string): number {
    const m = /^(\d{4}):(\d{3}):(\d{5})$/.exec(text);
    if (m === null) {
        throw new Error(`Bad SINEX time "${text}"`);
    }
    return Date.UTC(parseInt(m[1], 10), 0, 1) + (parseInt(m[2], 10) - 1) * 86400000 + parseInt(m[3], 10) * 1000;
}

export class SatelliteMetadata {
    private readonly blockBySvn: Map<string, string>;
    private readonly assignments: Map<number, PrnAssignment[]>;

    constructor(blockBySvn: Map<string, string>, assignments: Map<number, PrnAssignment[]>) {
        this.blockBySvn = blockBySvn;
        this.assignments = assignments;
    }

    public blockOf(prn: number, at: Date): string {
        const t = at.getTime();
        const assignment = (this.assignments.get(prn) ?? []).find(a => a.from <= t && t < a.to);
        if (assignment === undefined) {
            throw new Error(`No satellite carried PRN ${prn} at ${at.toISOString()} in the satellite metadata`);
        }
        const block = this.blockBySvn.get(assignment.svn);
        if (block === undefined) {
            throw new Error(`Satellite ${assignment.svn} (PRN ${prn}) has no block in the satellite metadata`);
        }
        return block;
    }
}

export function parseSatelliteMetadata(text: string): SatelliteMetadata {
    const blockBySvn = new Map<string, string>();
    const assignments = new Map<number, PrnAssignment[]>();
    let section = '';
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('+')) {
            section = line.substring(1).trim();
            continue;
        }
        if (line.startsWith('-')) {
            section = '';
            continue;
        }
        if (!line.startsWith(' ') || line.trim() === '') {
            continue;
        }
        const f = line.trim().split(/\s+/);
        if (section === 'SATELLITE/IDENTIFIER') {
            if (f[0].startsWith('G') && f.length >= 4) {
                blockBySvn.set(f[0], f[3]);
            }
        } else if (section === 'SATELLITE/PRN') {
            if (f[0].startsWith('G') && f.length >= 4 && f[3].startsWith('G')) {
                const prn = parseInt(f[3].substring(1), 10);
                const to = f[2] === '0000:000:00000' ? Infinity : sinexTime(f[2]);
                const list = assignments.get(prn) ?? [];
                list.push({svn: f[0], from: sinexTime(f[1]), to});
                assignments.set(prn, list);
            }
        }
    }
    return new SatelliteMetadata(blockBySvn, assignments);
}

export function buildEphemeris(rinexText: string, metadataText: string): Record<string, EphemerisEntry> {
    const metadata = parseSatelliteMetadata(metadataText);
    const first = new Map<number, RinexRecord>();
    for (const record of parseRinexNavigation(rinexText)) {
        if (!first.has(record.prn)) {
            first.set(record.prn, record);
        }
    }
    const result: Record<string, EphemerisEntry> = {};
    // Explicit numeric order, so the key order of the JSON does not rest on how an engine orders integer-like keys
    for (const prn of Array.from(first.keys()).sort((a, b) => a - b)) {
        const record = first.get(prn)!;
        result[String(prn)] = {...record.entry, block: metadata.blockOf(prn, record.epoch)};
    }
    return result;
}

export function serializeEphemeris(e: Record<string, EphemerisEntry>): string {
    return JSON.stringify(e, null, 2) + '\n';
}

export function generateEphemerisJson(sourceDir: string): string {
    const rinexFiles = fs.readdirSync(sourceDir).filter(f => /\.\d\dn$/i.test(f));
    if (rinexFiles.length !== 1) {
        throw new Error(`Expected exactly one RINEX navigation file (*.??n) in ${sourceDir}, found ${rinexFiles.length}`);
    }
    const rinex = fs.readFileSync(path.join(sourceDir, rinexFiles[0]), 'utf8');
    const metadata = fs.readFileSync(path.join(sourceDir, 'igs_satellite_metadata.snx'), 'utf8');
    return serializeEphemeris(buildEphemeris(rinex, metadata));
}
