import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';
import {KLN90BUserWaypointsTypes} from "./KLN90BUserWaypoints";


export type KLN90BUserRemarkTypes = {
    [key: string]: string;
};

export const NUM_REMARKS = 10;

type Def = UserSettingDefinition<KLN90BUserRemarkTypes[keyof KLN90BUserRemarkTypes]>;

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