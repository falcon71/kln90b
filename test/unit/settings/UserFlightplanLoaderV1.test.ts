import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLN90BUserFlightplansSettings} from '../../../kln90b/settings/KLN90BUserFlightplans';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {UserFlightplanLoaderV1} from '../../../kln90b/settings/UserFlightplanLoaderV1';
import {UserFlightplanPersistor} from '../../../kln90b/settings/UserFlightplanPersistor';
import {MessageHandler} from '../../../kln90b/data/MessageHandler';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {airport, vor} from '../../harness/navdata/builders';

// The version 1 file stored FPL 1 to 25 in fpl0 to fpl24 as 12 character ICAOs (type, region(2), airport(4), ident
// padded to 5) and did not store FPL 0. Version 2 stores FPL n in fpln as 19 character ICAOs.
const V1_FPL1 = 'A      KAAA VK1    ABC  ';

// The settings manager and the repository are singletons that every test of the file shares
const bus = new EventBus();
const repo = KLNFacilityRepository.getRepository(bus);
const settings = KLN90BUserFlightplansSettings.getManager(bus);
const loader = new KLNFacilityLoader(
    new MemoryFacilityClient([airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'})]) as unknown as ActualFacilityClient,
    repo,
);

beforeEach(() => {
    for (let i = 0; i <= 25; i++) {
        settings.getSetting(`fpl${i}`).set('');
    }
    settings.getSetting('fpl0').set(V1_FPL1);
});

describe('user flight plan V1 format (#47)', () => {
    it('restores fpl0 of the old file as FPL 1 and persists it as V2 fpl1', async () => {
        const plans = await new UserFlightplanLoaderV1(bus, loader, new MessageHandler()).restoreAllFlightplan();

        expect(plans.length).toBe(26);
        expect(plans.map(p => p.idx)).toEqual(Array.from({length: 26}, (_, i) => i));
        expect(plans[0].getLegs()).toEqual([]);
        expect(plans[1].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'ABC']);
        expect(plans[1].getLegs()[1].wpt.region).toBe('K1');

        // The conversion at boot (KLN90BCore) saves every restored plan again; FPL 1 must land in fpl1 in the V2 layout
        const persistor = new UserFlightplanPersistor(bus, loader, new MessageHandler(), new KLN90BUserSettings(bus));
        persistor.persistFlightplan(plans[1]);
        expect(settings.getSetting('fpl1').get()).toBe('A          KAAA    VK1        ABC     ');
    });

    it('is chosen by the persistor while userDataFormat is not 2', async () => {
        const persistor = new UserFlightplanPersistor(bus, loader, new MessageHandler(), new KLN90BUserSettings(bus));
        const plans = await persistor.restoreAllFlightplan();

        expect(plans[0].getLegs()).toEqual([]);
        expect(plans[1].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'ABC']);
    });
});
