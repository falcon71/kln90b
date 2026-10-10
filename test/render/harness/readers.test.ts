import {describe, expect, it} from 'vitest';
import {FacilityType} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';
import {activeIdent, fplIdents, messageLines, messages, turnStackLength, userWaypoints} from '../../harness/readers';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

describe('readers (harness)', () => {
    it('userWaypoints lists the user waypoints of every type, and with a type only that type', async () => {
        const unit = await bootUnit({
            storage: savedUserWaypoints([
                {kind: 'vor', ident: 'UVR', lat: 47.5, lon: 8.9, freqMHz: 114.3, magvar: 2},
                {kind: 'sup', ident: 'USUP', lat: 47.25, lon: 8.5},
            ]),
        });

        expect(userWaypoints(unit).map(f => f.icaoStruct.ident).sort()).toEqual(['USUP', 'UVR']);
        expect(userWaypoints(unit, FacilityType.USR).map(f => f.icaoStruct.ident)).toEqual(['USUP']);
        expect(userWaypoints(unit, FacilityType.VOR).map(f => f.icaoStruct.ident)).toEqual(['UVR']);
    });

    it('messages joins the lines of a message with a blank, messageLines keeps them apart', async () => {
        const unit = await bootUnit();
        const before = messages(unit).length;

        unit.props.messageHandler.addMessage(new OneTimeMessage(['FIRST LINE', 'SECOND LINE']));
        unit.props.messageHandler.addMessage(new OneTimeMessage(['ONE LINE']));

        expect(messages(unit).slice(before)).toEqual(['FIRST LINE SECOND LINE', 'ONE LINE']);
        expect(messageLines(unit).slice(before)).toEqual([['FIRST LINE', 'SECOND LINE'], ['ONE LINE']]);
    });

    it('fplIdents reads a flight plan by index, FPL 0 by default, and activeIdent the active waypoint', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const legs = [kaaa, abc, kbbb];
        const unit = await bootUnit({
            facilities: legs, position: {lat: kaaa.lat, lon: kaaa.lon},
            storage: {...savedFlightplan(0, legs), ...savedFlightplan(3, legs)},
        });
        await settle(unit);

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(fplIdents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(fplIdents(unit, 4)).toEqual([]);
        expect(activeIdent(unit)).toBe('ABC');
    });

    it('activeIdent is undefined and the turn stack empty without a flight plan', async () => {
        const unit = await bootUnit();
        await settle(unit);

        expect(activeIdent(unit)).toBeUndefined();
        expect(turnStackLength(unit)).toBe(0);
    });

    // ActiveWaypoint replaces the array on clearTurnStack (testing.md section 6), so the reader must not hold one
    it('turnStackLength reads the array the active waypoint holds now', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;

        aw.turnStack = [{} as (typeof aw.turnStack)[number], {} as (typeof aw.turnStack)[number]];

        expect(turnStackLength(unit)).toBe(2);
    });
});
