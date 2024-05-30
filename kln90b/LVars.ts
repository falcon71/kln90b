export const LVAR_BRIGHTNESS = "L:KLN90B_Brightness";  // Float, 0 to 1
export const LVAR_POWER = "L:KLN90B_Power"; // Boolean, position of the power switch. Might still be off if electricity is not avaiable
export const LVAR_RIGHT_SCAN = "L:KLN90B_RightScan"; //Boolean. false = in, normal. true = out, scan
export const LVAR_DISABLE = "L:KLN90B_Disabled"; // Set to 1 to disable this device completely for hot swapping
export const LVAR_OBS_SOURCE = "L:KLN90B_ObsSource"; // Changes Input.ObsSource from the panel.xml on the fly
export const LVAR_ELECTRICITY_INDEX = "L:KLN90B_ElectricitySimVarIndex"; // Changes the index of Input.ElectricitySimVar from the panel.xml on the fly
export const LVAR_OBS_TARGET = "L:KLN90B_ObsTarget"; // Changes Output.ObsTarget from the panel.xml on the fly
export const LVAR_GPS_SIMVARS = "L:KLN90B_WriteGpsSimvars"; // Changes Output.WriteGPSSimVars from the panel.xml on the fly


// Do not use GPS WP BEARING to animate a RMI, as that is optimized for the autopilot. This one will display the bearing according to appendix A of the manual.
// Please see https://github.com/falcon71/kln90b/wiki/RMI for details
export const LVAR_GPS_WP_BEARING = "L:KLN90B_GPS_WP_BEARING";


export const LVAR_MSG_LIGHT = "L:KLN90B_MsgLight"; //Boolean. true whenever the MSG light flashes
export const LVAR_WPT_LIGHT = "L:KLN90B_WptLight"; //Boolean. true if the waypoint alert is active
export const LVAR_ANNUN_TEST = "L:KLN90B_AnnunTest"; //Boolean. true if the self-test is shown and all external annunciator lights should light up

