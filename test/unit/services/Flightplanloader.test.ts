import {describe, expect, it} from 'vitest';
import {EventBus, FacilityClient, ICAO, IcaoValue} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {MessageHandler} from '../../../kln90b/data/MessageHandler';
import {Flightplan} from '../../../kln90b/data/flightplan/Flightplan';
import {Flightplanloader} from '../../../kln90b/services/Flightplanloader';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {vor} from '../../harness/navdata/builders';

// Appendix B (B-4: WAYPOINT ______ DELETED; B-3: OTHER WAYPOINTS DELETED when that message would be effective for more
// than ten waypoints). The flight plans of the unit are cut at 30 legs (4-1), and the legs that no longer exist in
// the database are dropped. The three loaders (V1, V2 and the EFB loader) share loadIcaos; the V2 loader is the one the
// unit uses to restore (UserFlightplanLoaderV2.test.ts covers its format).
const bus = new EventBus();
const repo = KLNFacilityRepository.getRepository(bus);
const KNOWN = Array.from({length: 40}, (_, i) => vor(`K${String(i).padStart(2, '0')}`, 47 + i / 100, 8, {region: 'K1'}));
const client = new KLNFacilityLoader(new MemoryFacilityClient(KNOWN) as unknown as ActualFacilityClient, repo);

class TestLoader extends Flightplanloader {
    constructor(messageHandler: MessageHandler) {
        super(bus, client as unknown as FacilityClient, messageHandler);
    }

    public load(icaos: IcaoValue[]): Promise<Flightplan> {
        return this.loadIcaos(icaos);
    }
}

const known = (i: number) => ICAO.value('V', 'K1', '', `K${String(i).padStart(2, '0')}`);
const gone = (i: number) => ICAO.value('V', 'K1', '', `GONE${i}`);
const messagesOf = (mh: MessageHandler) => mh.getMessages().map(m => m.message.join('|'));
const identsOf = (fpl: Flightplan) => fpl.getLegs().map(l => l.wpt.icaoStruct.ident);

async function load(icaos: IcaoValue[]) {
    const mh = new MessageHandler();
    const fpl = await new TestLoader(mh).load(icaos);
    return {fpl, messages: messagesOf(mh)};
}

describe('Flightplanloader.loadIcaos', () => {
    it('drops a missing waypoint, keeps the order of the others and reports it', async () => {
        const {fpl, messages} = await load([known(0), gone(1), known(2), known(3)]);

        expect(identsOf(fpl)).toEqual(['K00', 'K02', 'K03']);
        expect(messages).toEqual(['WAYPOINT GONE1 DELETED']);
    });

    // B-3: ten deleted waypoints are all named, none of them is OTHER
    it('names ten deleted waypoints one by one', async () => {
        const {fpl, messages} = await load([known(0), ...Array.from({length: 10}, (_, i) => gone(i))]);

        expect(identsOf(fpl)).toEqual(['K00']);
        expect(messages).toEqual(Array.from({length: 10}, (_, i) => `WAYPOINT GONE${i} DELETED`));
    });

    // B-3: more than ten waypoints give OTHER WAYPOINTS DELETED
    it('adds OTHER WAYPOINTS DELETED for the eleventh deleted waypoint', async () => {
        const {fpl, messages} = await load([known(0), ...Array.from({length: 11}, (_, i) => gone(i))]);

        expect(identsOf(fpl)).toEqual(['K00']);
        expect(messages).toContain('OTHER WAYPOINTS DELETED');
        expect(messages.filter(m => m.startsWith('WAYPOINT '))).toHaveLength(10);
    });

    // characterization: B-3 does not say whether the ten are named before OTHER, nor which ten. The code names the
    // first ten in plan order and posts OTHER last
    it('names the first ten deleted waypoints in plan order, then OTHER WAYPOINTS DELETED (characterization)', async () => {
        const {messages} = await load([known(0), ...Array.from({length: 15}, (_, i) => gone(i))]);

        expect(messages).toEqual([...Array.from({length: 10}, (_, i) => `WAYPOINT GONE${i} DELETED`), 'OTHER WAYPOINTS DELETED']);
    });

    // 4-1: 30 waypoints at most. The legs behind the 30th are reported like deleted ones
    it('cuts at 30 legs and names the legs behind them', async () => {
        const icaos = [...Array.from({length: 30}, (_, i) => known(i)), known(30), known(31)];
        const {fpl, messages} = await load(icaos);

        expect(identsOf(fpl)).toEqual(icaos.slice(0, 30).map(i => i.ident));
        expect(messages).toEqual(['WAYPOINT K30 DELETED', 'WAYPOINT K31 DELETED']);
    });

    it('counts the cut legs and the missing ones together towards the ten', async () => {
        // 6 cut legs and 5 missing legs inside the first 30: eleven in all, so ten are named and OTHER follows
        const icaos = [...Array.from({length: 25}, (_, i) => known(i)), ...Array.from({length: 5}, (_, i) => gone(i)),
            ...Array.from({length: 6}, (_, i) => known(30 + i))];
        const {fpl, messages} = await load(icaos);

        expect(fpl.getLegs()).toHaveLength(25);
        expect(messages.filter(m => m.startsWith('WAYPOINT '))).toHaveLength(10);
        expect(messages.filter(m => m === 'OTHER WAYPOINTS DELETED')).toHaveLength(1);
    });

    // characterization: the cut legs come first, then the missing ones (the order of loadIcaos)
    it('lists the cut legs before the missing ones (characterization)', async () => {
        const icaos = [...Array.from({length: 29}, (_, i) => known(i)), gone(0), known(30), known(31)];
        const {messages} = await load(icaos);

        expect(messages).toEqual(['WAYPOINT K30 DELETED', 'WAYPOINT K31 DELETED', 'WAYPOINT GONE0 DELETED']);
    });
});
