import {
    EventBus,
    Facility,
    FacilityRepositoryEvents,
    FacilityType,
    GeoKdTree,
    GeoKdTreeSearchFilter,
    GeoKdTreeSearchVisitor,
    GeoPoint,
    ICAO,
} from "@microsoft/msfs-sdk";
import {isUserWaypoint} from "../../pages/right/WaypointPage";
import {MAX_USER_WAYPOINTS} from "../../settings/KLN90BUserWaypoints";

/** Facility types for which {@link KLNFacilityRepository} supports spatial searches. */
export declare type KLNRepoSearchableFacilityTypes =
    FacilityType.USR
    | FacilityType.Airport
    | FacilityType.VOR
    | FacilityType.NDB
    | FacilityType.Intersection;


/**
 * Types of facility repository sync events.
 */
export enum FacilityRepositorySyncType {
    Add = 'Add',
    Remove = 'Remove',
    DumpRequest = 'DumpRequest',
    DumpResponse = 'DumpResponse',
    Update = 'Update',
}

/**
 * A facility repository sync event describing the addition of a facility.
 */
type FacilityRepositoryAdd = {
    /** The type of this event. */
    type: FacilityRepositorySyncType.Add;

    /** The facilities that were added. */
    facs: Facility[];
}

/**
 * A facility repository sync event describing the removal of a facility.
 */
type FacilityRepositoryRemove = {
    /** The type of this event. */
    type: FacilityRepositorySyncType.Remove;

    /** The ICAOs of the facilities that were removed. */
    facs: string[];
}

/**
 * A request for a dump of all facilities registered with the facility repository.
 */
type FacilityRepositoryDumpRequest = {
    /** The type of this event. */
    type: FacilityRepositorySyncType.DumpRequest;

    /** The unique ID associated with this event. */
    uid: number;
}
/**
 * A facility repository sync event describing the addition of a facility.
 */
type FacilityRepositoryUpdate = {
    /** The type of this event. */
    type: FacilityRepositorySyncType.Update;

    /** The facilities that were updated. */
    facs: Facility[];
}

/**
 * A response to a facility repository dump request.
 */
type FacilityRepositoryDumpResponse = {
    /** The type of this event. */
    type: FacilityRepositorySyncType.DumpResponse;

    /** The unique ID associated with the dump request that this event is responding to. */
    uid: number;

    /** All facilities registered with the repository that sent the response. */
    facs: Facility[];
}

/**
 * Data provided by a sync event.
 */
export type FacilityRepositorySyncData =
    FacilityRepositoryAdd
    | FacilityRepositoryRemove
    | FacilityRepositoryDumpRequest
    | FacilityRepositoryDumpResponse
    | FacilityRepositoryUpdate;

/**
 * Events related to data sync between facility repository instances.
 */
interface FacilityRepositorySyncEvents {
    /** A facility repository sync event. */
    KLNfacilityrepo_sync: FacilityRepositorySyncData;
}

type UserWaypoint<T extends Facility> = {
    -readonly [K in keyof T]: T[K]
}

/**
 * We use our own FacilityRepository, because the one from the SDK only supports USR as user waypoints.
 * In addition to those (known as Supplementary Waypoints in the KLN), the KLN allows user to define any waypoint as a
 * user waypoint. This FacilityRepository saves waypoints of any type.
 *
 */
export class KLNFacilityRepository {
    public static readonly SYNC_TOPIC = 'KLNfacilityrepo_sync';

    private readonly publisher = this.bus.getPublisher<FacilityRepositoryEvents & FacilityRepositorySyncEvents>();

    private static INSTANCE: KLNFacilityRepository | undefined;
    private readonly repos = new Map<FacilityType, Map<string, Facility>>();
    private lastDumpRequestUid?: number;
    private readonly trees: Record<KLNRepoSearchableFacilityTypes, GeoKdTree<Facility>> = {
        [FacilityType.USR]: new GeoKdTree(KLNFacilityRepository.treeKeyFunc),
        [FacilityType.Airport]: new GeoKdTree(KLNFacilityRepository.treeKeyFunc),
        [FacilityType.VOR]: new GeoKdTree(KLNFacilityRepository.treeKeyFunc),
        [FacilityType.NDB]: new GeoKdTree(KLNFacilityRepository.treeKeyFunc),
        [FacilityType.Intersection]: new GeoKdTree(KLNFacilityRepository.treeKeyFunc),
    };
    private ignoreSync = false;

    /**
     * Constructor.
     * @param bus The event bus.
     */
    private constructor(private readonly bus: EventBus) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.onSyncEvent.bind(this));

        // Request a dump from any existing instances on other instruments to initialize the repository.
        this.pubSyncEvent({
            type: FacilityRepositorySyncType.DumpRequest,
            uid: this.lastDumpRequestUid = Math.random() * Number.MAX_SAFE_INTEGER,
        });
    }

    private static readonly treeKeyFunc = (fac: Facility, out: Float64Array): Float64Array => {
        return GeoPoint.sphericalToCartesian(fac, out);
    };

    /**
     * Gets the number of facilities stored in this repository.
     * @param types The types of facilities to count. Defaults to all facility types.
     * @returns The number of facilities stored in this repository.
     */
    public size(types?: readonly FacilityType[]): number {
        let size = 0;

        if (types === undefined) {
            for (const repo of this.repos.values()) {
                size += repo.size;
            }
        } else {
            for (let i = 0; i < types.length; i++) {
                size += this.repos.get(types[i])?.size ?? 0;
            }
        }

        return size;
    }

    /**
     * Gets an instance of FacilityRepository.
     * @param bus The event bus.
     * @returns an instance of FacilityRepository.
     */
    public static getRepository(bus: EventBus): KLNFacilityRepository {
        return KLNFacilityRepository.INSTANCE ??= new KLNFacilityRepository(bus);
    }

    /**
     * Retrieves a facility from this repository.
     * @param icao The ICAO of the facility to retrieve.
     * @returns The requested user facility, or undefined if it was not found in this repository.
     */
    public get(icao: string): Facility | undefined {
        if (!ICAO.isFacility(icao)) {
            return undefined;
        }

        return this.repos.get(ICAO.getFacilityType(icao))?.get(icao);
    }

    /**
     * Searches for facilities around a point. Only supported for USR facilities.
     * @param type The type of facility for which to search.
     * @param lat The latitude of the query point, in degrees.
     * @param lon The longitude of the query point, in degrees.
     * @param radius The radius of the search, in great-arc radians.
     * @param visitor A visitor function. This function will be called once per element found within the search radius.
     * If the visitor returns `true`, then the search will continue; if the visitor returns `false`, the search will
     * immediately halt.
     * @throws Error if spatial searches are not supported for the specified facility type.
     */
    public search(type: KLNRepoSearchableFacilityTypes, lat: number, lon: number, radius: number, visitor: GeoKdTreeSearchVisitor<Facility>): void;

    /**
     * Searches for facilities around a point. Only supported for USR facilities.
     * @param type The type of facility for which to search.
     * @param lat The latitude of the query point, in degrees.
     * @param lon The longitude of the query point, in degrees.
     * @param radius The radius of the search, in great-arc radians.
     * @param maxResultCount The maximum number of search results to return.
     * @param out An array in which to store the search results.
     * @param filter A function to filter the search results.
     * @throws Error if spatial searches are not supported for the specified facility type.
     */
    public search(
        type: KLNRepoSearchableFacilityTypes,
        lat: number,
        lon: number,
        radius: number,
        maxResultCount: number,
        out: Facility[],
        filter?: GeoKdTreeSearchFilter<Facility>,
    ): Facility[]

    // eslint-disable-next-line jsdoc/require-jsdoc
    public search(
        type: KLNRepoSearchableFacilityTypes,
        lat: number,
        lon: number,
        radius: number,
        arg5: GeoKdTreeSearchVisitor<Facility> | number,
        out?: Facility[],
        filter?: GeoKdTreeSearchFilter<Facility>,
    ): void | Facility[] {
        if (typeof arg5 === 'number') {
            return this.trees[type].search(lat, lon, radius, arg5, out as Facility[], filter);
        } else {
            this.trees[type].search(lat, lon, radius, arg5);
        }
    }

    /**
     * Adds a facility to this repository and all other repositories synced with this one. If this repository already
     * contains a facility with the same ICAO as the facility to add, the existing facility will be replaced with the
     * new one.
     * @param fac The facility to add.
     * @throws Error if the facility has an invalid ICAO.
     */
    public add(fac: Facility): void {
        if (!ICAO.isFacility(fac.icao)) {
            throw new Error(`KLNFacilityRepository: invalid facility ICAO ${fac.icao}`);
        }

        this.addToRepo(fac);
        this.pubSyncEvent({type: FacilityRepositorySyncType.Add, facs: [fac]});
    }

    /**
     * Allows updating a user waypoint
     * @param fac
     * @param func the function reseives a waypoint, where the properties can be updated
     */
    public update<T extends Facility>(fac: T, func: (wpt: UserWaypoint<T>) => void) {
        if (!isUserWaypoint(fac)) {
            throw new Error(`${fac} is not a user waypoint`);
        }

        func(fac);


        //The coordinates might have changed, we need to update the tree
        const facilityType = ICAO.getFacilityType(fac.icao);

        if (facilityType !== FacilityType.USR &&
            facilityType !== FacilityType.Airport &&
            facilityType !== FacilityType.Intersection &&
            facilityType !== FacilityType.VOR &&
            facilityType !== FacilityType.NDB) {
            return;
        }

        this.trees[facilityType].removeAndInsert([fac], [fac]);
        this.pubSyncEvent({type: FacilityRepositorySyncType.Update, facs: [fac]});
    }

    /**
     * Removes a facility from this repository and all other repositories synced with this one.
     * @param fac The facility to remove.
     * @throws Error if the facility has an invalid ICAO.
     */
    public remove(fac: Facility | string): void {
        const icao = typeof fac === 'string' ? fac : fac.icao;
        if (!ICAO.isFacility(icao)) {
            throw new Error(`KLNFacilityRepository: invalid facility ICAO ${icao}`);
        }

        this.removeFromRepo(icao);
        this.pubSyncEvent({type: FacilityRepositorySyncType.Remove, facs: [icao]});
    }


    /**
     * Iterates over every facility in this respository with a visitor function.
     * @param fn A visitor function.
     * @param types The types of facilities over which to iterate. Defaults to all facility types.
     */
    public forEach(fn: (fac: Facility) => void, types?: readonly FacilityType[]): void {
        if (types === undefined) {
            for (const repo of this.repos.values()) {
                repo.forEach(fn);
            }
        } else {
            for (let i = 0; i < types.length; i++) {
                this.repos.get(types[i])?.forEach(fn);
            }
        }
    }

    /**
     * Adds a facility to this repository.
     * @param fac The facility to add.
     */
    private addToRepo(fac: Facility): void {
        if (this.size() >= MAX_USER_WAYPOINTS) {
            throw new Error("Repository is full");
        }

        const facilityType = ICAO.getFacilityType(fac.icao);

        let repo = this.repos.get(facilityType);
        if (repo === undefined) {
            this.repos.set(facilityType, repo = new Map<string, Facility>());
        }

        const existing = repo.get(fac.icao);

        repo.set(fac.icao, fac);

        if (facilityType === FacilityType.USR ||
            facilityType === FacilityType.Airport ||
            facilityType === FacilityType.Intersection ||
            facilityType === FacilityType.VOR ||
            facilityType === FacilityType.NDB) {
            if (existing === undefined) {
                this.trees[facilityType].insert(fac);
            } else {
                this.trees[facilityType].removeAndInsert([existing], [fac]);
            }
        }

        if (existing === undefined) {
            this.publisher.pub('facility_added', fac, false, false);
        } else {
            this.publisher.pub(`facility_changed_${fac.icao}`, fac, false, false);
            this.publisher.pub('facility_changed', fac, false, false);
        }
    }
    /**
     * Removes a facility from this repository.
     * @param fac The facility to remove, or the ICAO of the facility to remove.
     */
    private removeFromRepo(fac: Facility | string): void {
        const icao = typeof fac === 'string' ? fac : fac.icao;
        const facilityType = ICAO.getFacilityType(icao);
        const repo = this.repos.get(ICAO.getFacilityType(icao));

        if (repo === undefined) {
            return;
        }

        const facilityInRepo = repo.get(icao);

        if (facilityInRepo === undefined) {
            return;
        }

        repo.delete(icao);

        if (facilityType !== FacilityType.USR &&
            facilityType !== FacilityType.Airport &&
            facilityType !== FacilityType.Intersection &&
            facilityType !== FacilityType.VOR &&
            facilityType !== FacilityType.NDB) {
            return;
        }

        if (facilityType === FacilityType.USR ||
            facilityType === FacilityType.Airport ||
            facilityType === FacilityType.Intersection ||
            facilityType === FacilityType.VOR ||
            facilityType === FacilityType.NDB) {
            this.trees[facilityType].remove(facilityInRepo);
        }

        this.publisher.pub(`facility_removed_${icao}`, facilityInRepo, false, false);
        this.publisher.pub('facility_removed', facilityInRepo, false, false);
    }

    /**
     * Publishes a facility added or removed sync event over the event bus.
     * @param data The event data.
     */
    private pubSyncEvent(data: FacilityRepositorySyncData): void {
        this.ignoreSync = true;
        this.publisher.pub(KLNFacilityRepository.SYNC_TOPIC, data, true, false);
        this.ignoreSync = false;
    }
    /**
     * A callback which is called when a sync event occurs.
     * @param data The event data.
     */
    private onSyncEvent(data: FacilityRepositorySyncData): void {
        if (this.ignoreSync) {
            return;
        }

        switch (data.type) {
            case FacilityRepositorySyncType.DumpResponse:
                // Only accept responses to your own dump requests.
                if (data.uid !== this.lastDumpRequestUid) {
                    break;
                } else {
                    this.lastDumpRequestUid = undefined;
                }
            // eslint-disable-next-line no-fallthrough
            case FacilityRepositorySyncType.Add:
                if (data.facs.length === 1) {
                    this.addToRepo(data.facs[0]);
                } else {
                    throw new Error("addMultipleToRepo is not implemented");
                }
                break;
            case FacilityRepositorySyncType.Remove:
                if (data.facs.length === 1) {
                    this.removeFromRepo(data.facs[0]);
                } else {
                    throw new Error("removeMultipleFromRepo is not implemented");
                }
                break;
            case FacilityRepositorySyncType.DumpRequest:
                // Don't respond to your own dump requests.
                if (data.uid !== this.lastDumpRequestUid) {
                    const facs: Facility[] = [];
                    this.forEach(fac => facs.push(fac));
                    this.pubSyncEvent({type: FacilityRepositorySyncType.DumpResponse, uid: data.uid, facs});
                }
                break;
        }
    }

}