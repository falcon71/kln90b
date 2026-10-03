/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import {LatLon} from './geo';

export interface RecorderRow {
    t: number;
    lat: number;
    lon: number;
    altFt: number;
    gs: number;
    track: number;
    bank: number;
    nav: Record<string, unknown>;
    simvars: Record<string, number | string>;
    screen: string;
}

function xmlEscape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const OUTPUT = path.resolve(process.cwd(), 'test/flight/__output__');

/** One row per simulated second, written as JSONL and KML when a test fails. */
export class FlightRecorder {
    public readonly rows: RecorderRow[] = [];

    public record(row: RecorderRow): void {
        this.rows.push(row);
    }

    public write(testName: string, waypoints: (LatLon & { ident: string })[]): string {
        fs.mkdirSync(OUTPUT, {recursive: true});
        const base = path.join(OUTPUT, testName.replace(/[^A-Za-z0-9_-]+/g, '_'));
        fs.writeFileSync(`${base}.jsonl`, this.rows.map(r => JSON.stringify(r)).join('\n'));
        const coords = this.rows.map(r => `${r.lon},${r.lat},${(r.altFt * 0.3048).toFixed(1)}`).join(' ');
        const marks = waypoints.map(w => `<Placemark><name>${xmlEscape(w.ident)}</name><Point><coordinates>${w.lon},${w.lat},0</coordinates></Point></Placemark>`).join('');
        fs.writeFileSync(`${base}.kml`, `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEscape(testName)}</name>`
            + `<Placemark><name>track</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>${marks}</Document></kml>`);
        return base;
    }
}
