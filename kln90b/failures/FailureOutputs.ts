import {EventBus} from "@microsoft/msfs-sdk";
import {Interconnect} from "../Interconnect";
import {SensorsOut} from "../Sensors";
import {FailureChangedEvents, Failures} from "./Failures";
import {WTFlightplanSync} from "../services/WTFlightplanSync";
import {FAILURE_CATALOG, FailedOutputPort} from "./FailureCatalog";

/** Every output port a failure of the catalog takes */
const FAILABLE_OUTPUTS: readonly FailedOutputPort[] = FAILURE_CATALOG.reduce<FailedOutputPort[]>(
    (ports, d) => ports.concat(d.outputs.filter(p => !ports.includes(p))), []);

/**
 * The null state of a failed output port (#458, docs/failures.md "A failed port in general"): at the moment of the
 * failure, and when the unit claims the GPS SimVars again, the failed port writes its null state once, as a switched-off
 * unit leaves it. From then on it writes nothing until the repair, after which the next tick writes live values. The
 * power change is Sensors' own pass. Inputs need nothing
 */
export class FailureOutputs {
    private wtFlightplanSync: WTFlightplanSync | null = null;

    constructor(bus: EventBus, private readonly failures: Failures, private readonly interconnect: Interconnect,
                private readonly out: SensorsOut) {
        bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(evt => {
            const def = this.failures.definition(evt.key);
            if (def.outputs.some(p => this.interconnect.output(p) === this.interconnect.navData)) {
                //The planner travels on the nav data port: emptied at the failure, synced at the repair. sync() applies
                //the rule itself, so a failure that is not effective changes nothing
                this.wtFlightplanSync?.sync();
            }
            if (evt.active) {
                //A failure of a part the aircraft does not have is stored but fails nothing (Failures.isEffective)
                this.writeNullStates(this.failures.definition(evt.key).outputs.filter(p => this.failures.isOutputFailed(p)));
            }
        });
    }

    /** WTFlightplanSync is built after this class, because it needs the volatile memory */
    public setPlannerSync(sync: WTFlightplanSync): void {
        this.wtFlightplanSync = sync;
    }

    /**
     * A pass over every effectively failed output port. SimVarSync calls it when the unit claims the GPS SimVars again:
     * otherwise the failed port's GPS SimVars keep what another unit or the sim's own GPS last wrote
     */
    public writeFailedNullStates(): void {
        this.writeNullStates(FAILABLE_OUTPUTS.filter(p => this.failures.isOutputFailed(p)));
    }

    private writeNullStates(ports: readonly FailedOutputPort[]): void {
        if (ports.length === 0) {
            return;
        }
        this.interconnect.writeNullState(ports.map(p => this.interconnect.output(p)), () => this.out.writeNullState());
    }
}
