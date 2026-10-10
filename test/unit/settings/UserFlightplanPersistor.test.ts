import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, ICAO, UserFacility, UserFacilityType} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLN90BUserFlightplansSettings} from '../../../kln90b/settings/KLN90BUserFlightplans';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {UserFlightplanPersistor} from '../../../kln90b/settings/UserFlightplanPersistor';
import {MessageHandler} from '../../../kln90b/data/MessageHandler';
import {Flightplan, KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {identsOf} from '../../harness/readers';

// Contract source: CLAUDE.md "Public contract with aircraft" (persisted user data: the V2 flight-plan strings) and
// docs/architecture.md Core 7: `fpl{i}` stores FPL i for 0 to 25, including FPL 0, as concatenated 19 character ICAOs
// (type, region (2), airport (8), ident (8)), and only the legs of the kind USER are stored.
const bus = new EventBus();
const repo = KLNFacilityRepository.getRepository(bus);
const settings = KLN90BUserFlightplansSettings.getManager(bus);
const kaaa = airport('KAAA', 47, 8);
const abc = vor('ABC', 47.2, 8, {region: 'K1'});
const xy = ndb('XY', 47.3, 8.1, {region: 'K2'});
const fixa = intersection('FIXA', 47.4, 8.2, {region: 'K1'});
const user = {
    icao: '', icaoStruct: ICAO.value('U', 'XX', '', 'MYWPT'), name: '', lat: 47.5, lon: 8.3, region: 'XX', city: '',
    isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
} as unknown as UserFacility;
repo.add(user);
const loader = new KLNFacilityLoader(new MemoryFacilityClient([kaaa, abc, xy, fixa]) as unknown as ActualFacilityClient, repo);

const userSettings = new KLN90BUserSettings(bus);
userSettings.getSetting('userDataFormat').set(2);

// The literals are laid out by hand, one 19 character cell group per leg
const A_KAAA = 'A          KAAA    ';
const N_XY = 'NK2        XY      ';
const W_FIXA = 'WK1        FIXA    ';
const U_MYWPT = 'UXX        MYWPT   ';

function persistor(): UserFlightplanPersistor {
    return new UserFlightplanPersistor(bus, loader, new MessageHandler(), userSettings);
}

beforeEach(() => {
    settings.getAllSettings().forEach(s => s.set(''));
});

describe('user flight plan persistor (V2)', () => {
    it('stores FPL 25 under fpl25 and only the USER legs', () => {
        const fpl = new Flightplan(25, [
            {wpt: kaaa, type: KLNLegType.USER},
            {wpt: abc, type: KLNLegType.APP},
            {wpt: xy, type: KLNLegType.USER},
            {wpt: user, type: KLNLegType.USER},
        ], bus);

        persistor().persistFlightplan(fpl);

        expect(settings.getSetting('fpl25').get()).toBe(A_KAAA + N_XY + U_MYWPT);
    });

    it('stores an empty plan as the empty string', () => {
        // fpl3 holds a leg first, so that the change to '' is visible
        settings.getSetting('fpl3').set(A_KAAA);

        persistor().persistFlightplan(new Flightplan(3, [], bus));

        expect(settings.getSetting('fpl3').get()).toBe('');
    });

    it('round trips FPL 0 through the V2 layout', async () => {
        const p = persistor();
        p.persistFlightplan(new Flightplan(0, [{wpt: fixa, type: KLNLegType.USER}, {wpt: user, type: KLNLegType.USER}], bus));
        expect(settings.getSetting('fpl0').get()).toBe(W_FIXA + U_MYWPT);

        const plans = await p.restoreAllFlightplan();

        expect(identsOf(plans[0].getLegs())).toEqual(['FIXA', 'MYWPT']);
    });
});
