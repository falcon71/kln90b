import {describe, expect, it} from 'vitest';
import {copyFileSync, mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EPHEMERIS_PACKAGE_PATH, withFileSize, writePackagedEphemeris} from '../../../tools/ephemeris/layout.mjs';

const LAYOUT = JSON.stringify({
    content: [
        {path: 'a/first.js', size: 11, date: 133193178863126310},
        {path: EPHEMERIS_PACKAGE_PATH, size: 22, date: 1002},
        {path: 'a/last.css', size: 33, date: 1003},
    ],
}, null, 2);

describe('withFileSize', () => {
    it('replaces the size of the named entry', () => {
        const entry = JSON.parse(withFileSize(LAYOUT, EPHEMERIS_PACKAGE_PATH, 4567)).content
            .find((e: any) => e.path === EPHEMERIS_PACKAGE_PATH);
        expect(entry.size).toBe(4567);
    });

    it('keeps the date of the entry and every other entry', () => {
        const result = JSON.parse(withFileSize(LAYOUT, EPHEMERIS_PACKAGE_PATH, 4567));
        expect(result.content).toEqual([
            {path: 'a/first.js', size: 11, date: 133193178863126310},
            {path: EPHEMERIS_PACKAGE_PATH, size: 4567, date: 1002},
            {path: 'a/last.css', size: 33, date: 1003},
        ]);
    });

    it('leaves the 18-digit dates as written, which a JSON round trip would change', () => {
        const text = '{"content": [{"path": "x.json", "size": 1, "date": 133193178863126310}]}';
        expect(withFileSize(text, 'x.json', 2)).toBe('{"content": [{"path": "x.json", "size": 2, "date": 133193178863126310}]}');
    });

    it('throws when the path has no entry', () => {
        expect(() => withFileSize(LAYOUT, 'no/such/file.json', 1)).toThrow(/no\/such\/file\.json/);
    });

    it('keeps the line ending and the missing trailing newline of the file', () => {
        const crlf = LAYOUT.replace(/\n/g, '\r\n');
        const result = withFileSize(crlf, EPHEMERIS_PACKAGE_PATH, 5);
        expect(result.includes('\r\n')).toBe(true);
        expect(result.replace(/\r\n/g, '')).not.toContain('\n');
        expect(result.endsWith('}')).toBe(true);
        expect(withFileSize(LAYOUT + '\n', EPHEMERIS_PACKAGE_PATH, 5).endsWith('}\n')).toBe(true);
    });
});

describe('writePackagedEphemeris', () => {
    const REAL_LAYOUT = 'resources/layout.json';

    function packaged(json: string) {
        const dir = mkdtempSync(join(tmpdir(), 'kln90b-layout-'));
        copyFileSync(REAL_LAYOUT, join(dir, 'layout.json'));
        writePackagedEphemeris(dir, json);
        return dir;
    }

    it('writes the file at the package path and enters its byte size into the layout', () => {
        const json = '{"text":"äö and some more characters"}'; // Multi-byte, so the byte size is not the length
        const dir = packaged(json);
        try {
            const file = join(dir, EPHEMERIS_PACKAGE_PATH);
            expect(readFileSync(file, 'utf8')).toBe(json);
            const entry = JSON.parse(readFileSync(join(dir, 'layout.json'), 'utf8')).content
                .find((e: any) => e.path === EPHEMERIS_PACKAGE_PATH);
            expect(entry.size).toBe(statSync(file).size);
            expect(entry.size).not.toBe(json.length);
        } finally {
            rmSync(dir, {recursive: true});
        }
    });

    it('changes no other line of the layout', () => {
        const dir = packaged('{"a":1}');
        try {
            const before = readFileSync(REAL_LAYOUT, 'utf8').split(/\r?\n/);
            const after = readFileSync(join(dir, 'layout.json'), 'utf8').split(/\r?\n/);
            expect(after.length).toBe(before.length);
            const changed = after.map((line, i) => i).filter(i => after[i] !== before[i]);
            expect(changed.length).toBe(1);
            expect(before[changed[0]]).toMatch(/^\s*"size": \d+,?$/);
        } finally {
            rmSync(dir, {recursive: true});
        }
    });
});
