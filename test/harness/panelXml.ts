/**
 * A PlaneHTMLConfig document for BootOptions.panelXml, built from the keys the parser reads
 * (kln90b/settings/KLN90BPlaneSettings.ts). A key is the parser's dotted path; the parser walks it tag by tag and
 * falls back to its default for a tag it does not find, so a misspelled key would test the default. The keys are
 * therefore a closed list, and test/unit/harness/panelXml.test.ts parses each one.
 */
export const PANEL_KEYS = [
    'TakeHomeMode', 'BasePath', 'VFROnly',
    'Input.AltimeterInterfaced', 'Input.ObsSource', 'Input.HeadingInput', 'Input.ElectricitySimVar',
    'Input.Airdata.IsInterfaced', 'Input.Airdata.BaroSource',
    'Input.FuelComputer.IsInterfaced', 'Input.FuelComputer.Unit', 'Input.FuelComputer.Type',
    'Input.FuelComputer.FOBTransmitted', 'Input.FuelComputer.FuelUsedTransmitted',
    'Input.ExternalSwitches.LegObsSwitchInstalled', 'Input.ExternalSwitches.AppArmSwitchInstalled',
    'Output.ObsTarget', 'Output.AltitudeAlertEnabled', 'Output.WriteGPSSimVars',
] as const;

export type PanelKey = typeof PANEL_KEYS[number];

export type PanelOptions = Partial<Record<PanelKey, string | number | boolean>> & {
    /** Raw XML placed under <Instrument> after the keys, for what the keys do not cover */
    extra?: string;
};

type Node = { [tag: string]: Node | string };

export function panelXml(o: PanelOptions = {}): string {
    for (const key of Object.keys(o)) {
        if (key !== 'extra' && !(PANEL_KEYS as readonly string[]).includes(key)) {
            throw new Error(`panelXml: ${key} is not a key the parser reads (PANEL_KEYS)`);
        }
    }
    const root: Node = {};
    for (const key of PANEL_KEYS) {
        const value = o[key];
        if (value === undefined) continue;
        const path = key.split('.');
        let node = root;
        for (const tag of path.slice(0, -1)) {
            if (node[tag] === undefined) node[tag] = {};
            node = node[tag] as Node;
        }
        node[path[path.length - 1]] = String(value);
    }
    const xml = (n: Node): string =>
        Object.entries(n).map(([tag, c]) => `<${tag}>${typeof c === 'string' ? c : xml(c)}</${tag}>`).join('');
    return `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${xml(root)}${o.extra ?? ''}</Instrument></PlaneHTMLConfig>`;
}

/** ObsSource 0 disables the OBS course input; the value is synced to L:KLN90B_ObsSource (the parser default is 1, cfg/panel.xml) */
export const NO_OBS = {'Input.ObsSource': 0} as const;
export const HEADING_INPUT = {'Input.HeadingInput': true} as const;
export const NO_GPS_SIMVARS = {'Output.WriteGPSSimVars': false} as const;
export const LEG_OBS_SWITCH = {'Input.ExternalSwitches.LegObsSwitchInstalled': true} as const;
export const NO_ALTIMETER = {'Input.AltimeterInterfaced': false} as const;
export const VFR_ONLY = {'VFROnly': true} as const;
export const AIRDATA = {'Input.Airdata.IsInterfaced': true} as const;
/** Explicit, because the parser default (true) is the open question #141 */
export const ALTITUDE_ALERT = (enabled: boolean) => ({'Output.AltitudeAlertEnabled': enabled}) as const;

/** An interfaced fuel computer; the rest of its keys only when given */
export function fuelComputer(o: { unit?: string, type?: string, fob?: boolean, fuelUsed?: boolean } = {}): PanelOptions {
    const out: PanelOptions = {'Input.FuelComputer.IsInterfaced': true};
    if (o.unit !== undefined) out['Input.FuelComputer.Unit'] = o.unit;
    if (o.type !== undefined) out['Input.FuelComputer.Type'] = o.type;
    if (o.fob !== undefined) out['Input.FuelComputer.FOBTransmitted'] = o.fob;
    if (o.fuelUsed !== undefined) out['Input.FuelComputer.FuelUsedTransmitted'] = o.fuelUsed;
    return out;
}
