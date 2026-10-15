import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';
import {muteConsoleError} from '../../../harness/console';
import {collectStatusMessages} from '../../../harness/statusLine';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/** 250 user waypoints far away (the storage of createQqWithFullDatabase in SupPage.test.ts) */
async function bootWithFullDatabase(): Promise<HeadlessUnit> {
    muteConsoleError(); // the pages log the refusal
    const full = savedUserWaypoints(Array.from({length: 250}, (_, i) => ({
        kind: 'sup' as const, ident: `S${String(i).padStart(3, '0')}`, lat: 40 + i * 0.01, lon: 20,
    })));
    const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47.0, lon: 8.0}, storage: full});
    expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250); // precondition
    return unit;
}

type Memory = 'aptPage' | 'vorPage' | 'ndbPage' | 'intPage' | 'supPage';

/** A way to ask for a 251st user waypoint, and what the right page shows once it is refused */
interface Refusal {
    name: string;
    page: string;
    memory: Memory;
    ident: string;
    /** Brings the page to the point where the next ENT creates the waypoint */
    prepare: (unit: HeadlessUnit) => Promise<void>;
    /** The keys that repeat the same request, up to the ENT (the cursor stays where the refusal left it) */
    again: (unit: HeadlessUnit) => Promise<void>;
    /** The rows of the right half page right after the refusal: the creation state, with what was typed */
    rows: string[];
}

const typeUserPosition = async (unit: HeadlessUnit) => {
    await unit.panel.type('R', 'N4700000');
    await unit.panel.ent();
    await unit.panel.type('R', 'E1000000');
};
const userPos = async (unit: HeadlessUnit) => {
    await unit.panel.cursorTo('R', 'USER POS?');
    await unit.panel.ent();
    await typeUserPosition(unit);
};
const presPos = async (unit: HeadlessUnit) => {
    await unit.panel.cursorTo('R', 'PRES POS?');
};
const retypeLongitude = async (unit: HeadlessUnit) => {
    await unit.panel.type('R', 'E1000000');
};

const CREATION_PROMPT = [' QQ        ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  '];
const TYPED_POSITION = ["N 47°00.00'", "E100°00.00'"];

const REFUSALS: Refusal[] = [
    {name: 'APT 1 PRES POS?', page: 'APT 1', memory: 'aptPage', ident: 'QQ', prepare: presPos, again: presPos, rows: CREATION_PROMPT},
    {name: 'INT PRES POS?', page: 'INT  ', memory: 'intPage', ident: 'QQ', prepare: presPos, again: presPos, rows: CREATION_PROMPT},
    {name: 'SUP PRES POS?', page: 'SUP  ', memory: 'supPage', ident: 'QQ', prepare: presPos, again: presPos, rows: CREATION_PROMPT},
    {
        name: 'APT 1 USER POS?', page: 'APT 1', memory: 'aptPage', ident: 'QQ', prepare: userPos, again: retypeLongitude,
        rows: [' QQ        ', '           ', '           ', '           ', ...TYPED_POSITION],
    },
    {
        name: 'INT USER POS?', page: 'INT  ', memory: 'intPage', ident: 'QQ', prepare: userPos, again: retypeLongitude,
        rows: [' QQ        ', 'REF:  _____', 'RAD: ___._°', 'DIS:___._nm', ...TYPED_POSITION],
    },
    {
        name: 'SUP USER POS?', page: 'SUP  ', memory: 'supPage', ident: 'QQ', prepare: userPos, again: retypeLongitude,
        rows: [' QQ        ', 'REF:  _____', 'RAD: ___._°', 'DIS:___._nm', ...TYPED_POSITION],
    },
    {
        // The page keeps the typed position (the retype below needs only the longitude), frequency and variation stay empty
        name: 'VOR position', page: 'VOR  ', memory: 'vorPage', ident: 'QQQ', again: retypeLongitude,
        rows: [' QQQ       ', '           ', '          U', '___.__ __°_', ...TYPED_POSITION],
        prepare: async unit => {
            await unit.panel.outer('R', 1); // from the ident to the frequency
            await unit.panel.outer('R', 2); // to the latitude
            await typeUserPosition(unit);
        },
    },
    {
        name: 'NDB position', page: 'NDB  ', memory: 'ndbPage', ident: 'QQQ', again: retypeLongitude,
        rows: [' QQQ       ', '           ', '           ', 'FREQ ____._', ...TYPED_POSITION],
        prepare: async unit => {
            await unit.panel.outer('R', 1); // from the ident to the frequency
            await unit.panel.outer('R', 1); // to the latitude
            await typeUserPosition(unit);
        },
    },
];

/** The page with the ident entered, the creation asked for and the first ENT given: the refusal */
async function refused(r: Refusal): Promise<HeadlessUnit> {
    const unit = await bootWithFullDatabase();
    await unit.panel.selectPage('R', r.page);
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', r.ident);
    await r.prepare(unit);
    await unit.panel.ent();
    return unit;
}

describe('a user waypoint beyond the 250th (C-2)', () => {
    // C-2: USR DB FULL is the message of a user waypoint that cannot be created while 250 exist (2-8); none is stored
    it.each(REFUSALS)('refuses the waypoint of $name and stores nothing (C-2, 2-8, #289)', async r => {
        const unit = await refused(r);

        expect(Screen.read().status().mode).toBe('USR DB FULL');
        expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250);
        expect(unit.props.memory[r.memory].facility).toBeNull();
    });
});

describe('the waypoint pages after a refused creation (characterization, #289)', () => {
    // The rule: a refused creation leaves the page in the state it was in before the ENT. The creation prompt stays on
    // the pages that offer one, what was typed (here the position) stays on the pages that show it, the fields that were
    // not typed stay empty, and the cursor stays on. Repeating the request is refused again and stores nothing.
    it.each(REFUSALS)('shows $name after the refusal and refuses the same request again (characterization, #289)', async r => {
        const unit = await refused(r);
        expect(Screen.read().rows('R')).toEqual(r.rows);
        expect(Screen.read().status().right).toBe('CRSR');
        const messages = collectStatusMessages(unit);

        await r.again(unit);
        await unit.panel.ent();

        expect(messages).toEqual(['USR DB FULL']);
        expect(Screen.read().rows('R')).toEqual(r.rows);
        expect(Screen.read().status().right).toBe('CRSR');
        expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250);
        expect(unit.props.memory[r.memory].facility).toBeNull();
    });
});

