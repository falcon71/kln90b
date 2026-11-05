import {DefaultUserSettingManager} from '@microsoft/msfs-sdk';
import {KLN90BEepromTypes} from "../settings/KLN90BEepromSettings";
import {Failures} from "./Failures";
import {ZOOM_FACTOR} from "../data/Constants";

/**
 * SET 11 calibrates the D-bar at +300 and -300 mV (CMM 1027 to 1028), so the two stored points give a gain and a zero
 * point. 150 mV is full scale (IM 1-7).
 */
const DBAR_CAL_MV = 300;
const DBAR_FULL_SCALE_MV = 150;

//The draws are guesses (docs/failures.md): the centering 2 to 6 CRT pixels with a random sign, the D-bar from a gain of
//0.7 to 1.3 and a zero point of -45 to +45 mV (30 % of full scale)
const CENTER_MIN_PX = 2;
const CENTER_RANGE_PX = 4;
const GAIN_MIN = 0.7;
const GAIN_RANGE = 0.6;
const ZERO_MIN_MV = -45;
const ZERO_RANGE_MV = 90;

/**
 * The unit's shop calibration from its EEPROM (#459). While the EEPROM works, the unit corrects its CRT and its D-bar
 * output with these values, so nothing shows. A failed EEPROM falls back to the nominal values and the uncorrected errors
 * show: the screen is off center and the D-bar is off by the calibration's gain and zero point.
 *
 * Reading the four number settings allocates nothing, so the 16 Hz deviation write needs no cache. A stored 0 reads as
 * neutral: no shift, and a D-bar point of 0 as its nominal +-300 mV.
 */
export class EepromCalibration {
    constructor(private readonly settings: DefaultUserSettingManager<KLN90BEepromTypes>, private readonly failures: Failures) {
    }

    /**
     * Gives each value still at its default 0 a drawn one; the save manager then stores it. Called once after the settings
     * are loaded, so a new installation and an existing profile both get theirs at their next start, and nothing draws
     * them again. The two D-bar points come from one gain and zero point, so both are drawn when either is 0.
     * The random source is read in this order: X magnitude, X sign, Y magnitude, Y sign, gain, zero point.
     */
    public static drawMissing(settings: DefaultUserSettingManager<KLN90BEepromTypes>, random: () => number = Math.random): void {
        const x = settings.getSetting('eepromCrtCenterX');
        if (x.get() === 0) {
            x.set(EepromCalibration.drawCenter(random));
        }
        const y = settings.getSetting('eepromCrtCenterY');
        if (y.get() === 0) {
            y.set(EepromCalibration.drawCenter(random));
        }
        const plus = settings.getSetting('eepromDbarCalPlus');
        const minus = settings.getSetting('eepromDbarCalMinus');
        if (plus.get() === 0 || minus.get() === 0) {
            const gain = GAIN_MIN + GAIN_RANGE * random();
            const zero = ZERO_MIN_MV + ZERO_RANGE_MV * random();
            plus.set((DBAR_CAL_MV - zero) / gain);
            minus.set((-DBAR_CAL_MV - zero) / gain);
        }
    }

    private static drawCenter(random: () => number): number {
        const magnitude = CENTER_MIN_PX + CENTER_RANGE_PX * random();
        return random() < 0.5 ? -magnitude : magnitude;
    }

    /** Screen pixels the unit's screen is shifted to the right; 0 while the EEPROM works */
    public screenShiftXPx(): number {
        return this.screenShift('eepromCrtCenterX');
    }

    /** Screen pixels the unit's screen is shifted down; 0 while the EEPROM works */
    public screenShiftYPx(): number {
        return this.screenShift('eepromCrtCenterY');
    }

    /**
     * The D-bar deviation the pin puts out for the filtered one, in the same unit. While the EEPROM works it is the
     * filtered value; a failed EEPROM commands nominal values, so the output follows the line through the two
     * calibration points.
     * @param filtered The deviation the unit means to put out
     * @param fullScale The deviation of full scale in the same unit (the CDI scaling of the moment)
     */
    public dbarDeviation(filtered: number, fullScale: number): number {
        if (!this.failures.isEffective('eeprom')) {
            return filtered;
        }
        const plus = this.settings.getSetting('eepromDbarCalPlus').get() || DBAR_CAL_MV;
        const minus = this.settings.getSetting('eepromDbarCalMinus').get() || -DBAR_CAL_MV;
        const gain = 2 * DBAR_CAL_MV / (plus - minus);
        const zeroPoint = DBAR_CAL_MV - gain * plus;
        return filtered * gain + zeroPoint / DBAR_FULL_SCALE_MV * fullScale;
    }

    //The calibration moves the image by the stored centering, so the uncorrected image is off by its opposite
    private screenShift(key: 'eepromCrtCenterX' | 'eepromCrtCenterY'): number {
        if (!this.failures.isEffective('eeprom')) {
            return 0;
        }
        const center = this.settings.getSetting(key).get();
        return center === 0 ? 0 : -center * ZOOM_FACTOR;
    }
}
