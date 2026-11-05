import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';
import {KLN90BUserWaypointsTypes} from "./KLN90BUserWaypoints";


export type KLN90BUserRemarkTypes = {
    [key: string]: string;
};

//3-47: the remarks of up to 100 airports, one slot each. rmk10 to rmk99 were added for #92 and default to ""
export const NUM_REMARKS = 100;

type Def = UserSettingDefinition<KLN90BUserRemarkTypes[keyof KLN90BUserRemarkTypes]>;

/**
 * The airport remarks, part of the unit's battery-backed nonvolatile memory, which a failed battery wipes (#461).
 */
export class KLN90BUserRemarkSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BUserRemarkTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BUserWaypointsTypes> {
        return KLN90BUserRemarkSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        const defs: Def[] = [];
        for (let i = 0; i < NUM_REMARKS; i++) {
            defs.push({
                name: `rmk${i}`,
                defaultValue: "",
            })
        }
        return defs;
    }
}