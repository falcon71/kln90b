import {afterEach, describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../harness/boot';
import {muteConsoleError} from '../harness/console';
import {airport} from '../harness/navdata/builders';
import {Set1Page} from '../../kln90b/pages/left/Set1Page';
import {Set0Page} from '../../kln90b/pages/left/Set0Page';

// #118: a throw inside an ENT handler reaches the error page (the `error` topic) like a throw on any other key, and
// leaves no unhandled rejection behind. The handlers are made to throw with a spy, so these tests hold the routing of
// the error, not a page's behavior (characterization of the error routing, CLAUDE.md "Exceptions in ticks or input")
describe('an error thrown on ENT (characterization, #118)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reaches the error page from a half page (characterization, #118)', async () => {
        muteConsoleError();
        const boom = new Error('boom on ENT');
        vi.spyOn(Set1Page.prototype as any, 'setWpt').mockImplementation(() => {
            throw boom;
        });
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 11.0)], position: {lat: 47.5, lon: 11.25}});
        await settle(unit);
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent(); // the waypoint page of KAAA

        await unit.panel.ent(); // the approval calls setWpt, which throws

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.errors).toEqual([boom]);
    });

    it('reaches the error page from an overlay page (characterization, #118)', async () => {
        muteConsoleError();
        const boom = new Error('boom on ENT');
        vi.spyOn(Set0Page.prototype as any, 'next').mockImplementation(() => {
            throw boom;
        });
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        await unit.panel.cursor('L'); // UPDATE PUBLISHED DB

        await unit.panel.ent();

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.errors).toEqual([boom]);
    });
});
