import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {KLN90BFailureTypes} from "../settings/KLN90BFailureSettings";
import {FAILURE_CATALOG, FailedInputPort, FailedOutputPort, FailureDefinition, Lamp, FailureKey, failureSettingName} from "./FailureCatalog";

export interface FailureChangedEvents {
    failureChanged: { key: FailureKey, active: boolean };
}

const MAX_MTBF_HOURS = 999;

/** The setting name of each failure, built once: the ports ask on every write */
const SETTING_NAMES = new Map<FailureKey, ReturnType<typeof failureSettingName>>(
    FAILURE_CATALOG.map(d => [d.key, failureSettingName(d.key)]));

/**
 * Which failures the unit has (#458). The state is the saved settings, so it survives a session; the service holds none
 * of its own. A failure whose part the aircraft does not have stays stored but is not effective.
 */
export class Failures {
    constructor(private readonly bus: EventBus, private readonly settings: DefaultUserSettingManager<KLN90BFailureTypes>, private readonly planeSettings: KLN90PlaneSettings) {
    }

    //A loop, not find: FailureDetector.actsOnUnit asks it from the 16 Hz D-bar write (EepromCalibration), which allocates nothing
    public definition(key: FailureKey): FailureDefinition {
        for (let i = 0; i < FAILURE_CATALOG.length; i++) {
            if (FAILURE_CATALOG[i].key === key) {
                return FAILURE_CATALOG[i];
            }
        }
        throw new Error(`Unknown failure ${key}`);
    }

    public isActive(key: FailureKey): boolean {
        return this.settings.getSetting(SETTING_NAMES.get(key)!).get() !== "";
    }

    /**
     * The values a failure keeps in its setting text (#460): the parsed object, {} when the failure is inactive or the text
     * is not a plain object (an older session, a hand-edited profile)
     */
    public values(key: FailureKey): Record<string, number> {
        const text = this.settings.getSetting(SETTING_NAMES.get(key)!).get();
        if (text === "") {
            return {};
        }
        try {
            const parsed: unknown = JSON.parse(text);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, number>;
            }
        } catch (e) {
            //Falls through to {}
        }
        return {};
    }

    /** Stores values while the failure is active. Publishes nothing: the failure itself did not change */
    public setValues(key: FailureKey, values: Record<string, number>): void {
        if (!this.isActive(key)) {
            return;
        }
        this.settings.getSetting(SETTING_NAMES.get(key)!).set(JSON.stringify(values));
    }

    public isEligible(key: FailureKey): boolean {
        return this.definition(key).isEligible(this.planeSettings);
    }

    public isEffective(key: FailureKey): boolean {
        return this.isActive(key) && this.isEligible(key);
    }

    //The ports ask these on every write, so they allocate nothing. Eligibility is evaluated at every call, never cached
    public isOutputFailed(port: FailedOutputPort): boolean {
        for (let i = 0; i < FAILURE_CATALOG.length; i++) {
            const d = FAILURE_CATALOG[i];
            if (d.outputs.includes(port) && this.isActive(d.key) && d.isEligible(this.planeSettings)) {
                return true;
            }
        }
        return false;
    }

    public isInputFailed(port: FailedInputPort): boolean {
        for (let i = 0; i < FAILURE_CATALOG.length; i++) {
            const d = FAILURE_CATALOG[i];
            if (d.inputs.includes(port) && this.isActive(d.key) && d.isEligible(this.planeSettings)) {
                return true;
            }
        }
        return false;
    }

    /**
     * What a lamp does regardless of the command (#459): 'dark' for a burnt bulb or a shorted output (the lamp is
     * bypassed), 'stuck' for a driver stuck on. A dark lamp wins when both apply, as nothing lights then. Asked on every lamp write
     */
    public lampFault(lamp: Lamp): 'dark' | 'stuck' | null {
        let stuck = false;
        for (let i = 0; i < FAILURE_CATALOG.length; i++) {
            const d = FAILURE_CATALOG[i];
            if (d.lamp === undefined || d.lamp.lamp !== lamp || !this.isActive(d.key) || !d.isEligible(this.planeSettings)) {
                continue;
            }
            if (d.lamp.kind !== 'driver') {
                return 'dark';
            }
            stuck = true;
        }
        return stuck ? 'stuck' : null;
    }

    public activeList(): FailureDefinition[] {
        return this.sorted(FAILURE_CATALOG.filter(d => this.isActive(d.key)));
    }

    public inactiveList(): FailureDefinition[] {
        return this.sorted(FAILURE_CATALOG.filter(d => !this.isActive(d.key) && this.isEligible(d.key)));
    }

    public randomCandidates(): FailureDefinition[] {
        return FAILURE_CATALOG.filter(d => d.random && !this.isActive(d.key) && this.isEligible(d.key));
    }

    public fail(key: FailureKey): void {
        if (this.isActive(key)) {
            return;
        }
        this.settings.getSetting(failureSettingName(key)).set("{}");
        this.bus.getPublisher<FailureChangedEvents>().pub("failureChanged", {key, active: true}, false, false);
    }

    public repair(key: FailureKey): void {
        if (!this.isActive(key)) {
            return;
        }
        this.settings.getSetting(failureSettingName(key)).set("");
        this.bus.getPublisher<FailureChangedEvents>().pub("failureChanged", {key, active: false}, false, false);
    }

    public repairAll(): void {
        for (const d of FAILURE_CATALOG) {
            this.repair(d.key);
        }
    }

    /** 0 = no random failures */
    public get mtbfHours(): number {
        return this.settings.getSetting("failureMtbf").get();
    }

    public setMtbfHours(hours: number): void {
        this.settings.getSetting("failureMtbf").set(Math.min(MAX_MTBF_HOURS, Math.max(0, Math.round(hours))));
    }

    //Plain string order, not localeCompare, so that the order is the same on every machine
    private sorted(list: FailureDefinition[]): FailureDefinition[] {
        return list.sort((a, b) => a.flrName < b.flrName ? -1 : a.flrName > b.flrName ? 1 : 0);
    }
}
