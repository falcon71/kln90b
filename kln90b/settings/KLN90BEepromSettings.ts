import {DefaultUserSettingManager, EventBus, UserSettingDefinition} from '@microsoft/msfs-sdk';

/**
 * The unit's serial EEPROM (IC1045, 256 bits), which needs no battery. It holds the shop calibration of the unit: the
 * CRT centering of the real unit's maintenance display-alignment page SET 10 and the D-bar calibration of SET 11 (CMM 67, 1024 to 1028). These are properties of the unit,
 * so the battery's failure, which wipes the user memory (#461), never reaches them. A failed EEPROM falls back to the
 * nominal values (#459, EepromCalibration).
 *
 * The defaults are 0, which no draw gives: 0 means "not drawn yet" (EepromCalibration.drawMissing).
 * - eepromCrtCenterX, eepromCrtCenterY: the centering offsets in CRT pixels, horizontal and vertical
 * - eepromDbarCalPlus, eepromDbarCalMinus: the command in nominal millivolts that puts out exactly +300 and -300 mV
 */
export type KLN90BEepromTypes = {
    eepromCrtCenterX: number,
    eepromCrtCenterY: number,
    eepromDbarCalPlus: number,
    eepromDbarCalMinus: number,
};

type Def = UserSettingDefinition<KLN90BEepromTypes[keyof KLN90BEepromTypes]>;

export class KLN90BEepromSettings {
    private static INSTANCE: DefaultUserSettingManager<KLN90BEepromTypes> | undefined;

    public static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BEepromTypes> {
        return KLN90BEepromSettings.INSTANCE ??= new DefaultUserSettingManager(bus, this.buildSettingsDefs());
    }

    private static buildSettingsDefs(): Def[] {
        return [
            {name: 'eepromCrtCenterX', defaultValue: 0},
            {name: 'eepromCrtCenterY', defaultValue: 0},
            {name: 'eepromDbarCalPlus', defaultValue: 0},
            {name: 'eepromDbarCalMinus', defaultValue: 0},
        ];
    }
}
