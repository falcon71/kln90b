import {EventBus, FacilityLoader, FacilityRepository, FlightPlanRouteManager} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository} from "./data/navdata/KLNFacilityRepository";
import {ActualFacilityClient} from "./data/navdata/KLNFacilityLoader";

/**
 * What KLN90BCore needs from its environment that is not reached through the sim's global APIs (SimVar, Coherent,
 * DataStore). The sim uses SIM_PLATFORM; tests supply fakes.
 */
export interface KLN90BPlatform {
    /**
     * The navdata source behind KLNFacilityLoader
     * @param bus
     */
    createFacilityClient(bus: EventBus): ActualFacilityClient;

    /**
     * The repository for user waypoints of any type
     * @param bus
     */
    getFacilityRepository(bus: EventBus): KLNFacilityRepository;

    /**
     * EFB route sync
     */
    getRouteManager(): Promise<FlightPlanRouteManager>;
}

export const SIM_PLATFORM: KLN90BPlatform = {
    createFacilityClient: (bus: EventBus) => new FacilityLoader(FacilityRepository.getRepository(bus)),
    getFacilityRepository: (bus: EventBus) => KLNFacilityRepository.getRepository(bus),
    getRouteManager: () => FlightPlanRouteManager.getManager(),
};
