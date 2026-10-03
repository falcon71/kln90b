import {EventBus, FlightPlanRouteManager} from '@microsoft/msfs-sdk';
import {KLN90BPlatform} from '../../kln90b/KLN90BPlatform';
import {ActualFacilityClient} from '../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';

export class FakePlatform implements KLN90BPlatform {
    constructor(public readonly navdata: MemoryFacilityClient) {
    }

    public createFacilityClient(_bus: EventBus): ActualFacilityClient {
        // MemoryFacilityClient implements these methods at runtime; the SDK's generic overload types are not worth
        // reproducing in a test double.
        return this.navdata as unknown as ActualFacilityClient;
    }

    public getFacilityRepository(bus: EventBus): KLNFacilityRepository {
        return KLNFacilityRepository.getRepository(bus);
    }

    public getRouteManager(): Promise<FlightPlanRouteManager> {
        // No EFB attached
        return new Promise(() => undefined);
    }
}
