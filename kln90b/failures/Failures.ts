import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {KLN90BFailureTypes} from "../settings/KLN90BFailureSettings";
import {FAILURE_CATALOG, FailedInputPort, FailedOutputPort, FailureDefinition, FailureKey, failureSettingName} from "./FailureCatalog";

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

    public definition(key: FailureKey): FailureDefinition {
        return FAILURE_CATALOG.find(d => d.key === key)!;
    }

    public isActive(key: FailureKey): boolean {
        return this.settings.getSetting(SETTING_NAMES.get(key)!).get() !== "";
    }

    public isEligible(key: FailureKey): boolean {
        return this.definition(key).isEligible(this.planeSettings);
    }

    public isEffective(key: FailureKey): boolean {
        return this.isActive(key) && this.isEligible(key);
    }

    private effective(): FailureDefinition[] {
        return FAILURE_CATALOG.filter(d => this.isEffective(d.key));
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

    public activeList(): FailureDefinition[] {
        return this.sorted(FAILURE_CATALOG.filter(d => this.isActive(d.key)));
    }

    public inactiveList(): FailureDefinition[] {
        return this.sorted(FAILURE_CATALOG.filter(d => !this.isActive(d.key) && this.isEligible(d.key)));
    }

    public randomCandidates(): FailureDefinition[] {
        return FAILURE_CATALOG.filter(d => d.random && !this.isActive(d.key) && this.isEligible(d.key));
    }

    public anyTestFail(): boolean {
        return this.effective().some(d => d.testFail);
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
