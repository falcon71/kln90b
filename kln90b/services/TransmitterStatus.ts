import {EventBus, SimVarValueType} from "@microsoft/msfs-sdk";
import {LVAR_ARINC429_OUTPUT_TRANSMITTED, LVAR_RS232_OUTPUT_TRANSMITTED} from "../LVars";
import type {Interconnect} from "../Interconnect";
import type {FailureChangedEvents, Failures} from "../failures/Failures";
import type {PowerEvent} from "../PowerSupply";

export interface TransmittersStartedEvents {
    /** The boot is over: the Self Test page shows, or the main page at an engine-running start */
    transmittersStarted: boolean;
}

/** What the pages that end the boot need to say so */
interface StartProps {
    bus: EventBus;
    memory: { transmittersStarted: boolean };
}

/**
 * Called where the boot ends: when the Self Test page (or the Take-Home page) is shown, and at the main page of an
 * engine-running start, which skips the Self Test page. A later call in the same power-on changes nothing
 */
export function startTransmitters(props: StartProps): void {
    if (props.memory.transmittersStarted) {
        return;
    }
    props.memory.transmittersStarted = true;
    props.bus.getPublisher<TransmittersStartedEvents>().pub("transmittersStarted", true, false, false);
}

/**
 * L:KLN90B_Arinc429OutputTransmitted and L:KLN90B_Rs232OutputTransmitted (LVars.ts, #458): 1 while the unit transmits on
 * that output. An EFIS that takes the nav data and the MSG annunciation over the bus cannot see when the data stop, so
 * the aircraft reads these (agreed with an EFIS developer, 2026-11-04). 0 while the unit is off, while it boots until the
 * Self Test page shows, and while the output is failed. The RS-232 output carries only the nav data in the sim, so it
 * transmits only with Output.DataInterface RS232. Written at the boot, at every power change, when the boot ends and at
 * every failure change: the routing and the eligibility of both failures follow fixed panel.xml keys, so no other moment
 * changes them. A unit disabled for hot swapping keeps the values it had.
 */
export class TransmitterStatus {
    private isStarted: () => boolean = () => false;

    constructor(bus: EventBus, private readonly failures: Failures, private readonly interconnect: Interconnect,
                private readonly isPowered: () => boolean) {
        this.write(false);
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(() => {
            //A power-on is always the start of a boot, whatever the memory of the last power-on still says
            this.write(false);
        });
        bus.getSubscriber<TransmittersStartedEvents>().on("transmittersStarted").handle(() => this.write(true));
        bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(() => this.write(this.isStarted()));
    }

    /** VolatileMemory is built after this class */
    public setStarted(isStarted: () => boolean): void {
        this.isStarted = isStarted;
    }

    private write(started: boolean): void {
        const running = started && this.isPowered();
        //Real unit: fictional, no pin says whether a transmitter sends (see LVars.ts). Through the sim port, which never
        //fails, and outside any null-state pass, which would drop the write
        this.interconnect.sim.write(LVAR_ARINC429_OUTPUT_TRANSMITTED, SimVarValueType.Bool,
            running && !this.failures.isOutputFailed('arinc429Tx'));
        this.interconnect.sim.write(LVAR_RS232_OUTPUT_TRANSMITTED, SimVarValueType.Bool,
            running && this.interconnect.navData === this.interconnect.rs232Out && !this.failures.isOutputFailed('rs232Out'));
    }
}
