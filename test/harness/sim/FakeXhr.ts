/// <reference types="node" />

import fs from 'fs';
import path from 'path';
import {EPHEMERIS_SOURCE_DIR, generateEphemerisJson} from '../../../tools/ephemeris/ephemeris.mjs';

/** rollup copies resources/ into the package root, which is where coui:// URLs point. */
const RESOURCES = path.resolve(process.cwd(), 'resources');

let ephemerisJson: string | undefined;

/** The build generates the ephemeris file from ephemeris/; the harness does the same, once per process. */
function ephemeris(): string {
    ephemerisJson ??= generateEphemerisJson(EPHEMERIS_SOURCE_DIR);
    return ephemerisJson;
}

/**
 * XMLHttpRequest for coui:// URLs, served from resources/. The ephemeris file is not in resources/: it is generated
 * from ephemeris/ as the build does. Used by GPSSatComputer (ephemeris) and MSA.
 */
export class FakeXhr {
    public readonly requests: string[] = [];

    public install(g: any): void {
        const requests = this.requests;
        g.XMLHttpRequest = class FakeXMLHttpRequest {
            static readonly DONE = 4;
            public readyState = 0;
            public status = 0;
            public responseText = '';
            public response: unknown = '';
            public onreadystatechange: (() => void) | null = null;
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            private url = '';

            open(_method: string, url: string): void {
                this.url = url;
            }

            setRequestHeader(): void {
            }

            overrideMimeType(): void {
            }

            addEventListener(type: string, cb: () => void): void {
                if (type === 'load') this.onload = cb;
                if (type === 'error') this.onerror = cb;
                if (type === 'readystatechange') this.onreadystatechange = cb;
            }

            send(): void {
                requests.push(this.url);
                setTimeout(() => {
                    const file = path.join(RESOURCES, this.url.replace(/^coui:\/\//, ''));
                    try {
                        this.responseText = this.url.endsWith('Assets/gps_ephemeris.json')
                            ? ephemeris() : fs.readFileSync(file, 'utf8');
                        this.response = this.responseText;
                        this.status = 200;
                    } catch {
                        this.status = 404;
                    }
                    this.readyState = 4;
                    this.onreadystatechange?.();
                    if (this.status === 200) this.onload?.(); else this.onerror?.();
                }, 0);
            }
        };
    }
}
