import {SimVarValueType} from "@microsoft/msfs-sdk";
import {AntennaAttitude, LEVEL_ATTITUDE} from "./GpsSignal";

/**
 * Where the attitude of the GPS antenna comes from (#467). The antenna sits on top of the fuselage, its base level within
 * 5 degrees in level flight (Installation Manual 2-1), so it tilts with the airframe. The airframe is not an input of the
 * unit, so this does not go through the Interconnect. The platform supplies the source: the SimVars in the sim, a level
 * antenna in the tests
 */
export interface AntennaAttitudeSource {
    /** Fills out with the current attitude in the convention of GpsSignal (nose up and right wing down positive). Allocates nothing */
    read(out: AntennaAttitude): void;
}

/** The airframe's attitude from the sim. MSFS gives the pitch positive nose down and the bank positive left wing down */
export class SimVarAntennaAttitude implements AntennaAttitudeSource {
    public read(out: AntennaAttitude): void {
        out.headingTrueDeg = SimVar.GetSimVarValue('PLANE HEADING DEGREES TRUE', SimVarValueType.Degree);
        out.pitchUpDeg = -SimVar.GetSimVarValue('PLANE PITCH DEGREES', SimVarValueType.Degree);
        out.bankRightDeg = -SimVar.GetSimVarValue('PLANE BANK DEGREES', SimVarValueType.Degree);
        out.onGround = !!SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool);
    }
}

/** A level antenna in flight, heading north, whatever the airframe does */
export const LEVEL_ANTENNA: AntennaAttitudeSource = {
    read(out: AntennaAttitude): void {
        out.headingTrueDeg = LEVEL_ATTITUDE.headingTrueDeg;
        out.pitchUpDeg = LEVEL_ATTITUDE.pitchUpDeg;
        out.bankRightDeg = LEVEL_ATTITUDE.bankRightDeg;
        out.onGround = LEVEL_ATTITUDE.onGround;
    },
};
