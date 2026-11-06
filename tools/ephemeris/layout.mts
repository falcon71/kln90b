// Loaded by rollup.config.mjs through Node's type stripping: erasable syntax only, no project imports.
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";

/** Where the generated ephemeris file lies in the packaged community folder. */
export const EPHEMERIS_PACKAGE_PATH = 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json';

/**
 * Returns the layout.json text with the size of one entry replaced. The sim checks the sizes of the package, so a file
 * the build generates must be entered with its real byte size. Everything else stays byte for byte as it is.
 * @param layoutText
 * @param path path of the entry, as written in the layout
 * @param size size of the file in bytes
 */
export function withFileSize(layoutText: string, path: string, size: number): string {
    // Text replacement, not parse and stringify: the dates are 18 digits, more than a JSON number in JavaScript holds,
    // so a round trip would change them.
    const pathJson = JSON.stringify(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entry = new RegExp(`("path":\\s*${pathJson},\\s*"size":\\s*)\\d+`);
    if (!entry.test(layoutText)) {
        throw new Error(`layout.json has no entry for ${path}`);
    }
    return layoutText.replace(entry, (_match, head: string) => head + size);
}

/**
 * Writes the generated ephemeris file into a packaged community folder and enters its byte size into the layout.json
 * there. The folder must already hold the layout.json (the build copies resources/ first).
 * @param outputDir the packaged community folder
 * @param json the text of the ephemeris file
 */
export function writePackagedEphemeris(outputDir: string, json: string): void {
    const file = `${outputDir}/${EPHEMERIS_PACKAGE_PATH}`;
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, json);
    const layoutFile = `${outputDir}/layout.json`;
    writeFileSync(layoutFile, withFileSize(readFileSync(layoutFile, 'utf8'), EPHEMERIS_PACKAGE_PATH,
        Buffer.byteLength(json, 'utf8')));
}
