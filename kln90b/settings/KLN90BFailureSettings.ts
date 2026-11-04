import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';
import {FAILURE_CATALOG, FailureKey, failureSettingName} from "../failures/FailureCatalog";

/**
 * failure_<key>: "" = working, anything else = failed (the stored text is "{}", room for later fields). failureMtbf: the
 * mean time between random failures in hours, 0 = off (#458)
 */
export type KLN90BFailureTypes = { failureMtbf: number } & { [K in `failure_${FailureKey}`]: string };

type Def = UserSettingDefinition<KLN90BFailureTypes[keyof KLN90BFailureTypes]>;

export class KLN90BFailureSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BFailureTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BFailureTypes> {
        return KLN90BFailureSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        const defs: Def[] = [{name: 'failureMtbf', defaultValue: 0}];
        for (const failure of FAILURE_CATALOG) {
            defs.push({name: failureSettingName(failure.key), defaultValue: ""});
        }
        return defs;
    }
}
