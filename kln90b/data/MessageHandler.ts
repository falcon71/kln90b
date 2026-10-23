import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {BoundaryUtils} from "./navdata/BoundaryUtils";
import {LodBoundary} from "@microsoft/msfs-sdk";
import {NavPageState} from "./VolatileMemory";

export interface Message {
    seen: boolean;
    readonly message: string[];
    isConditionValid: () => boolean;
    /**
     * Called by MessageHandler.clear when the unit is switched off, for a persistent message that keeps state of the
     * power-on in which it was posted
     */
    onPowerOff?: () => void;
}

/**
 * This message will be shown once to the pilot and removes once seen
 */
export class OneTimeMessage implements Message {

    public seen: boolean = false;

    constructor(public readonly message: string[]) {
    }

    public isConditionValid(): boolean {
        return !this.seen;
    }
}

export class MessageHandler implements CalcTickable {

    //A lot of messages depent on state. All those messages are kept here
    public persistentMessages: Message[] = [];
    //The messages, that are currently presented to the user
    private activeMessages: Message[] = [];

    public hasMessages(): boolean {
        return this.activeMessages.length > 0;
    }

    public getMessages(): Message[] {
        return this.activeMessages;
    }

    public hasUnreadMessages(): boolean {
        return this.activeMessages.filter(m => !m.seen).length > 0;
    }

    public addMessage(message: Message): void {
        this.activeMessages.push(message);
    }

    /**
     * A message describes the power-on in which it was posted, so the unit loses them all when it is switched off.
     * The persistent messages come back at the next tick when their condition holds. A read one comes back read: its
     * seen flag is kept (the maintainer's ruling, #351). One whose condition has lapsed by the first tick after the
     * power-on has its seen flag reset by tick, as at any other time.
     */
    public clear(): void {
        this.activeMessages = [];
        for (const message of this.persistentMessages) {
            message.onPowerOff?.();
        }
    }

    public tick() {
        this.activeMessages = this.activeMessages.filter(m => m.isConditionValid());
        for (const message of this.persistentMessages) {
            const isValid = message.isConditionValid();
            if (isValid) {
                if (!this.activeMessages.includes(message)) {
                    this.activeMessages.push(message);
                }
            } else {
                message.seen = false;
            }
        }
    }
}


/**
 * AIRSPACE ALERT stays while the alert still warns of the area (the warned areas map its key to this message) and the
 * aircraft is not laterally inside it. Reading the message does not remove it (#412). The check of the alert refreshes
 * the warned areas every 10 seconds; the live position makes the message go at once when the aircraft enters. Once its
 * condition has failed, the message has left the MSG page for good and stays invalid, so the next check that finds the
 * area to warn of again posts a new one, even if the aircraft was back outside before that check.
 */
export class AirspaceAlertMessage implements Message {

    public seen: boolean = false;
    private ended: boolean = false;

    constructor(public readonly message: string[], private readonly airspace: LodBoundary, private readonly key: string, private readonly sensors: Sensors, private readonly navState: NavPageState) {
    }

    public isConditionValid(): boolean {
        //TODO need to check that we are still closing in
        this.ended = this.ended || this.navState.airspaceWarned.get(this.key) !== this || BoundaryUtils.isInside(this.airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
        return !this.ended;
    }
}

/**
 * INSIDE SPC USE AIRSPACE stays while the aircraft is inside the area (the entered areas map its key to this message) and
 * laterally inside this boundary. Reading the message does not remove it (#412). Like AIRSPACE ALERT, it stays invalid
 * once its condition has failed, so the next check that finds the aircraft inside again posts a new one.
 */
export class InsideAirspaceMessage implements Message {

    public seen: boolean = false;
    private ended: boolean = false;

    constructor(public readonly message: string[], private readonly airspace: LodBoundary, private readonly key: string, private readonly sensors: Sensors, private readonly navState: NavPageState) {
    }

    public isConditionValid(): boolean {
        this.ended = this.ended || this.navState.airspaceEntered.get(this.key) !== this || !BoundaryUtils.isInside(this.airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
        return !this.ended;
    }
}
