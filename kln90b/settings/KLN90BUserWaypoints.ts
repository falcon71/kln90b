import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';


export type KLN90BUserWaypointsTypes = {
    [key: string]: string;
};

export const MAX_USER_WAYPOINTS = 250;

type Def = UserSettingDefinition<KLN90BUserWaypointsTypes[keyof KLN90BUserWaypointsTypes]>;

export class KLN90BUserWaypointsSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BUserWaypointsTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BUserWaypointsTypes> {
        return KLN90BUserWaypointsSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        const defs: Def[] = [];
        for (let i = 0; i < MAX_USER_WAYPOINTS; i++) {
            defs.push({
                name: `wpt${i}`,
                defaultValue: "",
            })
        }
        return defs;
    }
}