import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';
import {FAILURE_CATALOG, FailureKey, failureSettingName} from "../failures/FailureCatalog";

/**
 * failure_<key>: "" = working, anything else = failed (the stored text is "{}" until a failure stores values, #460). failureMtbf: the
 * mean time between random failures in hours, 0 = off (#458). batteryHealth: the internal battery's charge in percent,
 * batteryDate: the sim date (E:ABSOLUTE TIME, seconds) of the last session, 0 = never run (#461)
 */
export type KLN90BFailureTypes = { failureMtbf: number, batteryHealth: number, batteryDate: number } & { [K in `failure_${FailureKey}`]: string };

type Def = UserSettingDefinition<KLN90BFailureTypes[keyof KLN90BFailureTypes]>;

/**
 * Fictional: the simulation's own state, which failures the unit has, not memory of the unit. Neither the battery's
 * failure (#461) nor the EEPROM's reaches it.
 */
export class KLN90BFailureSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BFailureTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BFailureTypes> {
        return KLN90BFailureSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        const defs: Def[] = [{name: 'failureMtbf', defaultValue: 0}, {name: 'batteryHealth', defaultValue: 100}, {name: 'batteryDate', defaultValue: 0}];
        for (const failure of FAILURE_CATALOG) {
            defs.push({name: failureSettingName(failure.key), defaultValue: ""});
        }
        return defs;
    }
}
