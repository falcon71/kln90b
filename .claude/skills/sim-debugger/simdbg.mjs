#!/usr/bin/env node
// Reads from the running sim through the Coherent GT debugger (see SKILL.md next to this file).
//
// The debugger speaks an old WebKit inspector protocol over a WebSocket. Node's built-in WebSocket client is closed by
// the server, so this script carries a minimal client of its own. The protocol has no awaitPromise: async work parks its
// result in a page global that a second evaluate collects.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const [HOST, PORT] = (process.env.SIMDBG_HOST ?? '127.0.0.1:19999').split(':');
const DEFAULT_PAGE = 'KLN90B';
const USAGE = `usage: node simdbg.mjs <command> [options]
  pages                                   list the inspectable pages
  simvar <name> <unit> [<name> <unit>…]   read SimVars or LVars (L:…)
  screen [--mask]                         the unit's 23x7 screen, as the render tests read it
  facility <ident> [--type A|V|N|W] [--region RR] [--out file]
                                          load a facility from the sim's navdata
  eval <expression>                       evaluate JavaScript, print the value
  async <expression>                      evaluate JavaScript that returns a promise, print what it resolves to
options: --page <id|title text> (default ${DEFAULT_PAGE}), --timeout <ms> (default 10000)`;

class UserError extends Error {
}

function parseArgs(argv) {
    const opts = {page: DEFAULT_PAGE, timeout: 10000, type: 'A', region: null, out: null, mask: false};
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--mask') opts.mask = true;
        else if (['--page', '--timeout', '--type', '--region', '--out'].includes(a)) {
            if (i + 1 >= argv.length) throw new UserError(`${a} needs a value`);
            opts[a.slice(2)] = argv[++i];
        } else rest.push(a);
    }
    opts.timeout = Number(opts.timeout);
    opts.type = opts.type.toUpperCase();
    return {command: rest[0], args: rest.slice(1), opts};
}

function getJson(urlPath) {
    return new Promise((resolve, reject) => {
        http.get({host: HOST, port: PORT, path: urlPath, timeout: 5000}, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', e => reject(e.code === 'ECONNREFUSED'
            ? new UserError(`The debugger is not reachable at ${HOST}:${PORT}. Is the sim running in developer mode?`)
            : e));
    });
}

async function findPage(selector) {
    const pages = await getJson('/pagelist.json');
    if (/^\d+$/.test(selector)) {
        const page = pages.find(p => p.id === Number(selector));
        if (!page) throw new UserError(`No page ${selector}. Run "pages" for the list.`);
        return page;
    }
    const matches = pages.filter(p => (p.title ?? '').toLowerCase().includes(selector.toLowerCase()));
    if (matches.length === 0) {
        throw new UserError(`No page title contains "${selector}". Is the aircraft with the unit loaded? Run "pages" for the list.`);
    }
    if (matches.length > 1) {
        throw new UserError(`Several pages match "${selector}", pick one with --page <id>:\n${matches.map(p => `  ${p.id}  ${p.title}`).join('\n')}`);
    }
    return matches[0];
}

/** One WebSocket connection to one page's inspector. */
class Inspector {
    #sock;
    #buf = Buffer.alloc(0);
    #fragments = [];
    #nextId = 1;
    #pending = new Map();
    #answered = false;

    static connect(page) {
        return new Promise((resolve, reject) => {
            const ins = new Inspector();
            const sock = ins.#sock = net.connect(Number(PORT), HOST);
            let upgraded = false;
            sock.on('connect', () => sock.write(`GET /devtools/page/${page.id} HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\n`
                + `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n`
                + 'Sec-WebSocket-Version: 13\r\n\r\n'));
            sock.on('data', d => {
                ins.#buf = Buffer.concat([ins.#buf, d]);
                if (!upgraded) {
                    const end = ins.#buf.indexOf('\r\n\r\n');
                    if (end < 0) return;
                    if (!ins.#buf.subarray(0, end).toString().startsWith('HTTP/1.1 101')) {
                        reject(new Error(`Handshake refused: ${ins.#buf.subarray(0, end).toString().split('\r\n')[0]}`));
                        sock.destroy();
                        return;
                    }
                    upgraded = true;
                    ins.#buf = ins.#buf.subarray(end + 4);
                    resolve(ins);
                }
                ins.#readFrames();
            });
            const fail = e => {
                // The server takes one inspector per page and resets any further connection right after the handshake
                const err = ins.#answered ? (e ?? new Error('The debugger closed the connection'))
                    : new UserError(`Page ${page.id} (${page.title}) refused the connection: another inspector is probably `
                        + 'attached to it (a debugger window). Close it, or read SimVars through another page with --page VLogic.');
                reject(err);
                for (const p of ins.#pending.values()) p.reject(err);
                ins.#pending.clear();
            };
            sock.on('error', fail);
            sock.on('close', () => fail(null));
        });
    }

    #readFrames() {
        while (this.#buf.length >= 2) {
            const fin = (this.#buf[0] & 0x80) !== 0;
            const opcode = this.#buf[0] & 0x0f;
            const masked = (this.#buf[1] & 0x80) !== 0;
            let len = this.#buf[1] & 0x7f;
            let off = 2;
            if (len === 126) {
                if (this.#buf.length < 4) return;
                len = this.#buf.readUInt16BE(2);
                off = 4;
            } else if (len === 127) {
                if (this.#buf.length < 10) return;
                len = Number(this.#buf.readBigUInt64BE(2));
                off = 10;
            }
            const maskKey = masked ? this.#buf.subarray(off, off + 4) : null;
            if (masked) off += 4;
            if (this.#buf.length < off + len) return;
            let payload = Buffer.from(this.#buf.subarray(off, off + len));
            this.#buf = this.#buf.subarray(off + len);
            if (maskKey) payload = payload.map((b, i) => b ^ maskKey[i % 4]);
            if (opcode === 0x9) this.#send(0xa, payload);
            if (opcode === 0x8 || opcode === 0x9 || opcode === 0xa) continue;
            this.#fragments.push(payload);
            if (!fin) continue;
            const text = Buffer.concat(this.#fragments).toString('utf8');
            this.#fragments = [];
            const msg = JSON.parse(text);
            const p = this.#pending.get(msg.id);
            if (!p) continue;
            this.#answered = true;
            this.#pending.delete(msg.id);
            if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
            else p.resolve(msg.result);
        }
    }

    #send(opcode, payload) {
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
        else if (payload.length < 65536) {
            header = Buffer.alloc(4);
            header[1] = 0x80 | 126;
            header.writeUInt16BE(payload.length, 2);
        } else {
            header = Buffer.alloc(10);
            header[1] = 0x80 | 127;
            header.writeBigUInt64BE(BigInt(payload.length), 2);
        }
        header[0] = 0x80 | opcode;
        this.#sock.write(Buffer.concat([header, mask, payload.map((b, i) => b ^ mask[i % 4])]));
    }

    call(method, params) {
        const id = this.#nextId++;
        return new Promise((resolve, reject) => {
            this.#pending.set(id, {resolve, reject});
            this.#send(0x1, Buffer.from(JSON.stringify({id, method, params})));
        });
    }

    /** Evaluates a synchronous expression and returns its value. */
    async evaluate(expression) {
        const r = await this.call('Runtime.evaluate', {expression, returnByValue: true, doNotPauseOnExceptionsAndMuteConsole: true});
        if (r.wasThrown) throw new UserError(`The page threw: ${r.result.description ?? JSON.stringify(r.result.value)}`);
        return r.result.value;
    }

    /** Evaluates an expression that may return a promise and returns what it resolves to. */
    async evaluateAsync(expression, timeout) {
        const key = JSON.stringify(crypto.randomUUID());
        await this.evaluate(`(() => {
            const box = window.__simdbg || (window.__simdbg = {});
            const s = box[${key}] = {done: false};
            Promise.resolve().then(() => (${expression}))
                .then(v => { s.done = true; s.value = v; }, e => { s.done = true; s.error = String(e && e.stack || e); });
            return true;
        })()`);
        const collect = `(() => {
            const box = window.__simdbg, s = box && box[${key}];
            if (!s || !s.done) return null;
            delete box[${key}];
            if (Object.keys(box).length === 0) delete window.__simdbg;
            return JSON.stringify({error: s.error, value: s.value});
        })()`;
        const until = Date.now() + timeout;
        while (Date.now() < until) {
            const json = await this.evaluate(collect);
            if (json !== null) {
                const s = JSON.parse(json);
                if (s.error) throw new UserError(`The page rejected: ${s.error}`);
                return s.value;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        await this.evaluate(`(() => { const box = window.__simdbg; if (box) { delete box[${key}]; if (Object.keys(box).length === 0) delete window.__simdbg; } })()`);
        throw new UserError(`No result within ${timeout} ms`);
    }

    close() {
        this.#sock.destroy();
    }
}

/**
 * Page code that loads one facility. It searches the ident first, since only the search gives the region a VOR, NDB or
 * intersection needs, then loads it through the page's own facility listener with a handler of its own that it removes
 * again. The page's SDK FacilityLoader sees the reply too and ignores it, because it has no request queued for it.
 */
function facilityExpression(ident, type, region) {
    return `(async () => {
        const ident = ${JSON.stringify(ident)}, type = ${JSON.stringify(type)}, region = ${JSON.stringify(region)};
        const listener = ViewListener.g_ViewListenersMgr.getListenerByName('JS_LISTENER_FACILITY');
        if (!listener || !listener.connected) throw new Error('This page has no connected facility listener; use the KLN90B page');
        const searchFilter = {A: 1, W: 2, V: 3, N: 4}[type];
        const found = (await Coherent.call('SEARCH_BY_IDENT_WITH_STRUCT', ident, searchFilter, 40))
            .filter(i => i.ident === ident && i.type === type && (region === null || type === 'A' || i.region === region));
        if (found.length !== 1) return {matches: found.map(i => ({region: i.region, airport: i.airport, ident: i.ident}))};
        const icao = found[0];
        const event = {A: 'SendAirport', V: 'SendVor', N: 'SendNdb', W: 'SendIntersection'}[type];
        const call = {A: 'LOAD_AIRPORT_FROM_STRUCT', V: 'LOAD_VOR_FROM_STRUCT', N: 'LOAD_NDB_FROM_STRUCT', W: 'LOAD_INTERSECTION_FROM_STRUCT'}[type];
        const allAirportData = 127;
        return await new Promise((resolve, reject) => {
            const finish = (facility, error) => {
                clearTimeout(timer);
                listener.off(event, handler);
                if (error) reject(error); else resolve({facility});
            };
            // An airport's ICAO value has no region, but the reply names one (KBFI: K1), so airports match by ident
            const handler = f => {
                const i = f.icaoStruct;
                if (!i || i.type !== icao.type || i.ident !== icao.ident) return;
                if (type === 'A' ? f.loadedDataFlags === allAirportData : i.region === icao.region && i.airport === icao.airport) finish(f);
            };
            const timer = setTimeout(() => finish(null, new Error('No reply from the sim within 5 s')), 5000);
            listener.on(event, handler);
            (type === 'A' ? Coherent.call(call, icao, allAirportData) : Coherent.call(call, icao))
                .then(ok => { if (!ok) finish(null, new Error('The sim did not find ' + JSON.stringify(icao))); });
        });
    })()`;
}

/** Page code that reads the screen with the render tests' own reader, test/harness/render/screen.ts. */
async function screenExpression(withMask) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.resolve(here, '../../../test/harness/render/screen.ts'), 'utf8');
    const {default: ts} = await import('typescript');
    const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017}}).outputText;
    return `(() => { const exports = {}; ${js}\n; const s = exports.Screen.read(); return ${withMask ? 's.dump()' : 's.text()'}; })()`;
}

function print(value) {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1));
}

async function main() {
    const {command, args, opts} = parseArgs(process.argv.slice(2));
    if (command === 'pages') {
        for (const p of await getJson('/pagelist.json')) console.log(`${String(p.id).padStart(3)}  ${p.title}`);
        return;
    }
    let expression;
    let isAsync = false;
    switch (command) {
        case 'eval':
        case 'async':
            if (args.length !== 1) throw new UserError(USAGE);
            expression = args[0];
            isAsync = command === 'async';
            break;
        case 'simvar':
            if (args.length === 0 || args.length % 2 !== 0) throw new UserError(USAGE);
            expression = `(() => { const r = {}; ${Array.from({length: args.length / 2}, (_, i) =>
                `r[${JSON.stringify(args[2 * i])}] = SimVar.GetSimVarValue(${JSON.stringify(args[2 * i])}, ${JSON.stringify(args[2 * i + 1])});`).join(' ')} return r; })()`;
            break;
        case 'screen':
            expression = await screenExpression(opts.mask);
            break;
        case 'facility':
            if (args.length !== 1 || !['A', 'V', 'N', 'W'].includes(opts.type)) throw new UserError(USAGE);
            expression = facilityExpression(args[0].toUpperCase(), opts.type, opts.region);
            isAsync = true;
            break;
        default:
            throw new UserError(USAGE);
    }
    const page = await findPage(opts.page);
    const ins = await Inspector.connect(page);
    try {
        const value = isAsync ? await ins.evaluateAsync(expression, opts.timeout) : await ins.evaluate(expression);
        if (command !== 'facility') {
            print(value);
        } else if (value.matches) {
            const list = value.matches.map(m => `  ${m.region} ${m.ident}${m.airport ? ` (terminal, ${m.airport})` : ''}`).join('\n');
            throw new UserError(value.matches.length === 0 ? `No ${opts.type} facility ${args[0]} found`
                : `Several matches, pick one with --region:\n${list}`);
        } else if (opts.out) {
            const json = JSON.stringify(value.facility, null, 1);
            fs.writeFileSync(opts.out, json);
            const f = value.facility;
            print({icao: `${f.icaoStruct.type} ${f.icaoStruct.region} ${f.icaoStruct.airport} ${f.icaoStruct.ident}`, name: f.name,
                lat: f.lat, lon: f.lon, bytes: json.length, out: opts.out});
        } else {
            print(value.facility);
        }
    } finally {
        ins.close();
    }
}

main().catch(e => {
    console.error(e instanceof UserError ? e.message : e);
    process.exit(1);
});
