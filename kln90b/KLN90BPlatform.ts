import {EventBus, FacilityLoader, FacilityRepository, FlightPlanRouteManager} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository} from "./data/navdata/KLNFacilityRepository";
import {ActualFacilityClient} from "./data/navdata/KLNFacilityLoader";
import {GpsMeasurement, SimulatedMeasurement} from "./GpsMeasurement";
import {AntennaAttitudeSource, SimVarAntennaAttitude} from "./AntennaAttitude";

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

    /**
     * Where the GPS takes its position, ground speed and track from while it has a fix (#402)
     */
    createGpsMeasurement(): GpsMeasurement;

    /**
     * Where the attitude of the GPS antenna comes from, which tilts the satellites' signals (#467)
     */
    createAntennaAttitude(): AntennaAttitudeSource;

    /**
     * The random source of the satellites' signal fades and estimate noise (#467)
     */
    createSignalRandom(): () => number;
}

export const SIM_PLATFORM: KLN90BPlatform = {
    createFacilityClient: (bus: EventBus) => new FacilityLoader(FacilityRepository.getRepository(bus)),
    getFacilityRepository: (bus: EventBus) => KLNFacilityRepository.getRepository(bus),
    getRouteManager: () => FlightPlanRouteManager.getManager(),
    createGpsMeasurement: () => new SimulatedMeasurement(),
    createAntennaAttitude: () => new SimVarAntennaAttitude(),
    createSignalRandom: () => Math.random,
};
