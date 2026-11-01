import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, ICAO, UserFacility, UserFacilityType} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLN90BUserFlightplansSettings} from '../../../kln90b/settings/KLN90BUserFlightplans';
import {UserFlightplanLoaderV2} from '../../../kln90b/settings/UserFlightplanLoaderV2';
import {MessageHandler} from '../../../kln90b/data/MessageHandler';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {identsOf} from '../../harness/readers';
import {Flightplan} from '../../../kln90b/data/flightplan/Flightplan';

// Contract source: CLAUDE.md "Public contract with aircraft" (persisted user data: the V2 flight-plan strings) and
// docs/architecture.md Core 7: `fpl{i}` stores FPL i for 0 to 25, including FPL 0, as concatenated 19 character ICAOs
// (type, region (2), airport (8), ident (8)).
const bus = new EventBus();
const repo = KLNFacilityRepository.getRepository(bus);
const settings = KLN90BUserFlightplansSettings.getManager(bus);
const loader = new KLNFacilityLoader(
    new MemoryFacilityClient([
        airport('KAAA', 47, 8),
        vor('ABC', 47.2, 8, {region: 'K1'}),
        ndb('XY', 47.3, 8.1, {region: 'K2'}),
        intersection('FIXA', 47.4, 8.2, {region: 'K1'}),
    ]) as unknown as ActualFacilityClient,
    repo,
);
// Legs of the kind USER are looked up in the repository of user waypoints
repo.add({
    icao: '', icaoStruct: ICAO.value('U', 'XX', '', 'MYWPT'), name: '', lat: 47.5, lon: 8.3, region: 'XX', city: '',
    isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
} as unknown as UserFacility);

// The literals are laid out by hand, one 19 character cell group per leg
const A_KAAA = 'A          KAAA    ';
const V_ABC = 'VK1        ABC     ';
const N_XY = 'NK2        XY      ';
const W_FIXA = 'WK1        FIXA    ';
const U_MYWPT = 'UXX        MYWPT   ';

const flags = (plan: Flightplan) => plan.getLegs().map(l => l.flyOver === true);

function restore(messageHandler = new MessageHandler()) {
    return new UserFlightplanLoaderV2(bus, loader, messageHandler).restoreAllFlightplan();
}

beforeEach(() => {
    // Not a loop to 25: a break of the number of plans would then fail every test here, which hides which test holds what
    settings.getAllSettings().forEach(s => s.set(''));
});

describe('user flight plan V2 loader', () => {
    it('restores FPL 0 from fpl0 and FPL 25 from fpl25, every facility kind', async () => {
        settings.getSetting('fpl0').set(A_KAAA + V_ABC + N_XY + W_FIXA + U_MYWPT);
        settings.getSetting('fpl25').set(V_ABC + A_KAAA);

        const plans = await restore();

        expect(plans.length).toBe(26);
        expect(plans[0].getLegs().map(l => [l.wpt.icaoStruct.type, l.wpt.icaoStruct.region, l.wpt.icaoStruct.ident])).toEqual([
            ['A', '', 'KAAA'], ['V', 'K1', 'ABC'], ['N', 'K2', 'XY'], ['W', 'K1', 'FIXA'], ['U', 'XX', 'MYWPT'],
        ]);
        expect(plans[25].idx).toBe(25);
        expect(identsOf(plans[25].getLegs())).toEqual(['ABC', 'KAAA']);
        expect(plans[1].getLegs()).toEqual([]);
    });

    it('drops a missing facility, keeps the others and reports it', async () => {
        settings.getSetting('fpl2').set(A_KAAA + 'VK1        GONE    ' + V_ABC);
        const messageHandler = new MessageHandler();

        const plans = await restore(messageHandler);

        expect(identsOf(plans[2].getLegs())).toEqual(['KAAA', 'ABC']);
        expect(messageHandler.getMessages().map(m => m.message)).toEqual([['WAYPOINT GONE DELETED']]);
    });

    it('keeps 30 legs of a longer stored plan and reports the rest', async () => {
        settings.getSetting('fpl4').set(A_KAAA.repeat(30) + V_ABC);
        const messageHandler = new MessageHandler();

        const plans = await restore(messageHandler);

        expect(plans[4].getLegs().length).toBe(30);
        expect(identsOf(plans[4].getLegs())).not.toContain('ABC');
        expect(messageHandler.getMessages().map(m => m.message)).toEqual([['WAYPOINT ABC DELETED']]);
    });

    // The trailer is our own format (docs/superpowers/specs/2026-11-01-flyover-waypoints-design.md, Storage)
    it('restores the fly-over flags of the trailer (characterization)', async () => {
        settings.getSetting('fpl3').set(W_FIXA + V_ABC + '02C');
        const plans = await restore();
        expect(identsOf(plans[3].getLegs())).toEqual(['FIXA', 'ABC']);
        expect(flags(plans[3])).toEqual([false, true]);
    });
    it('keeps the flags with their legs when a stored waypoint is gone (characterization)', async () => {
        settings.getSetting('fpl2').set(A_KAAA + 'VK1        GONE    ' + V_ABC + '03E');
        const plans = await restore();
        expect(identsOf(plans[2].getLegs())).toEqual(['KAAA', 'ABC']);
        expect(flags(plans[2])).toEqual([false, true]);
    });
    it('keeps the flag of leg 30 when a longer stored plan is cut (characterization)', async () => {
        settings.getSetting('fpl4').set(A_KAAA.repeat(30) + V_ABC + '31AAAAgA');
        const plans = await restore();
        expect(plans[4].getLegs().length).toBe(30);
        expect(plans[4].getLegs()[29].flyOver).toBe(true);
        expect(flags(plans[4]).filter(f => f).length).toBe(1);
    });
    it('loads the legs en route when the trailer does not fit (characterization)', async () => {
        settings.getSetting('fpl5').set(W_FIXA + V_ABC + '03C');
        const plans = await restore();
        expect(identsOf(plans[5].getLegs())).toEqual(['FIXA', 'ABC']);
        expect(flags(plans[5])).toEqual([false, false]);
    });
});
