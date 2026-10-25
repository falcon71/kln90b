import {Facility, FacilityClient, FacilityType, ICAO, UserSetting} from "@microsoft/msfs-sdk";

/**
 * A waypoint the unit keeps over a power cycle, kept in a user setting as its ICAO string (V2; V1 is deprecated); "" for
 * none. Only user settings survive a sim restart, so a power-on resolves the waypoint again from the setting, and a
 * power cycle and a sim restart give the same result (#192)
 */
export class SavedWaypoint<T extends Facility> {

    /**
     * @param setting The setting the ICAO string is kept in
     * @param types The facility types the waypoint may have; a saved waypoint of another type does not resolve. Any
     * type when left out
     */
    constructor(private readonly setting: UserSetting<string>, private readonly types?: readonly FacilityType[]) {
    }

    /**
     * Saves the waypoint. The setting is written only when the string differs, so a page that writes the same waypoint
     * again (a nearest rank in every tick, the restore itself) writes nothing
     */
    public save(facility: T | null): void {
        const icao = facility === null ? "" : ICAO.valueToStringV2(facility.icaoStruct);
        if (icao !== this.setting.get()) {
            this.setting.set(icao);
        }
    }

    /**
     * Resolves the saved waypoint. A waypoint that does not resolve (a deleted user waypoint, a temporary waypoint the
     * power-off deleted, another database, a corrupted value, a waypoint of another type) gives null, and the setting is
     * cleared. Never rejects
     * @param loader The facility client
     * @param isCurrent Whether the power-on that restores is still the current one. Only then is the setting cleared: the
     * lookup of an earlier power-on that answers late (a hung request the SDK resolves with null once the same waypoint
     * is asked for again) must not clear a waypoint the current power-on restored (#416, spec 4.3)
     */
    public async restore(loader: FacilityClient, isCurrent: () => boolean = () => true): Promise<T | null> {
        const icao = this.setting.get();
        if (icao === "") {
            return null;
        }
        try {
            const value = ICAO.stringV2ToValue(icao);
            const type = ICAO.getFacilityTypeFromValue(value);
            if (this.types !== undefined && !this.types.includes(type)) {
                throw new Error(`a waypoint of the type ${type}, expected ${this.types.join(", ")}`);
            }
            return await loader.getFacility(type, value) as Facility as T;
        } catch (e) {
            //Expected after a database change or a deleted user waypoint, so a warning and not an error
            console.warn(`The saved waypoint ${icao} does not resolve`, e);
            if (isCurrent()) {
                this.save(null);
            }
            return null;
        }
    }
}
