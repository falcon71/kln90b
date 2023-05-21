import {Celsius, Feet, Inhg, Kelvin, Knots} from "./Units";
import {UnitType} from "@microsoft/msfs-sdk";

/**
 * https://edwilliams.org/avform147.htm#Altimetry
 * @param pressureAlt
 * @param baro
 */
export function pressureAlt2IndicatedAlt(pressureAlt: Feet, baro: Inhg): Feet {
    return pressureAlt - pressureAltCorr(baro);
}

/**
 * https://edwilliams.org/avform147.htm#Altimetry
 * @param indicatedAlt
 * @param baro
 */
export function indicatedAlt2PressureAlt(indicatedAlt: Feet, baro: Inhg): Feet {
    return indicatedAlt + pressureAltCorr(baro);
}

function pressureAltCorr(baro: Inhg): Feet {
    return 145442.2 * (1 - (baro / 29.92126) ** 0.190261);
}

/**
 * https://edwilliams.org/avform147.htm#Altimetry
 * @param pressureAlt
 * @param sat
 */
export function pressureAlt2DensityAlt(pressureAlt: Feet, sat: Celsius): Feet {
    const T_s = 15 - 0.0019812 * pressureAlt;
    return pressureAlt + 118.6 * (sat - T_s);
}

/**
 * https://edwilliams.org/avform147.htm#Mach
 * @param mach
 * @param tat
 */
export function mach2Tas(mach: number, tat: Celsius) {
    const K = 1;
    const OAT = calcOat(tat, mach, K);
    const CS = 38.967854 * Math.sqrt(UnitType.CELSIUS.convertTo(OAT, UnitType.KELVIN));
    return mach * CS;
}

export function cas2Mach(cas: Knots, pressureAlt: Feet) {
    const P_0 = 29.92126;
    const CS_0 = 661.4786;
    const DP = P_0 * ((1 + 0.2 * (cas / CS_0) ** 2) ** 3.5 - 1);

    const P = P_0 * (1 - 6.8755856 * 10 ** -6 * pressureAlt) ** 5.2558797;

    return (5 * ((DP / P + 1) ** (2 / 7) - 1)) ** 0.5;
}




function calcOat(tat: Celsius, mach: number, recoveryFactor: number) {
    return UnitType.KELVIN.convertTo(UnitType.CELSIUS.convertTo(tat, UnitType.KELVIN) / (1 + 0.2 * recoveryFactor * mach ** 2), UnitType.CELSIUS);
}