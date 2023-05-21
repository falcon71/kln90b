import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';
import {KLN90BUserWaypointsTypes} from "./KLN90BUserWaypoints";


export type KLN90BUserFlightplansTypes = {
    [key: string]: string;
};

export const NUM_FLIGHTPLANS = 25;

type Def = UserSettingDefinition<KLN90BUserFlightplansTypes[keyof KLN90BUserFlightplansTypes]>;

export class KLN90BUserFlightplansSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BUserFlightplansTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BUserWaypointsTypes> {
        return KLN90BUserFlightplansSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        const defs: Def[] = [];
        for (let i = 0; i < NUM_FLIGHTPLANS; i++) {
            defs.push({
                name: `fpl${i}`,
                defaultValue: "",
            })
        }
        return defs;
    }
}