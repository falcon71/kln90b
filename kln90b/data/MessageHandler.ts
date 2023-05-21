import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {BoundaryUtils} from "./navdata/BoundaryUtils";
import {convertTextToKLNCharset} from "./Text";
import {LodBoundary} from "@microsoft/msfs-sdk";

export interface Message {
    seen: boolean;
    readonly message: string[];
    isConditionValid: () => boolean;
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
    private activeMessages: Message[] = []; //todo clear messages when power is off

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
     * Displays an error as a KLN message. The message is formatted to fit in the small screen.
     * Only the line numbers in the kln90b.js are shown.
     * @param error
     */
    public addError(error: Error): void {
        const rawStack = error.stack!;
        const text = (`ERR:${convertTextToKLNCharset(error.message)}`).match(/.{1,22}/g)!;

        const formattedStack = rawStack.split("\n").map(this.formatStack).filter(s => s !== "");
        for (const stackLine of formattedStack) { //Each stack entry plus space is 9 chars long
            if (text[text.length - 1].length + 9 > 21) {
                if (text.length >= 6) {
                    //We can't display more than six lines
                    break;
                }
                text.push(stackLine);
            } else {
                text[text.length - 1] += ` ${stackLine}`;
            }
        }

        this.activeMessages.push(new OneTimeMessage(text));
    }

    /**
     * The display is way to0 small, we only take the line numbers
     * @private
     */
    private formatStack(line: string): string {
        const match = line.match(/kln90b.js:(\d+:\d+)/);
        if (match === null) {
            return "";
        }
        return match[1];
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


export class AirspaceAlertMessage extends OneTimeMessage {


    constructor(message: string[], private readonly airspace: LodBoundary, private readonly sensors: Sensors) {
        super(message);
    }

    public isConditionValid(): boolean {
        //TODO need to check that we are still closing in
        return super.isConditionValid() && !BoundaryUtils.isInside(this.airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
    }
}

export class InsideAirspaceMessage extends OneTimeMessage {


    constructor(message: string[], private readonly airspace: LodBoundary, private readonly sensors: Sensors) {
        super(message);
    }

    public isConditionValid(): boolean {
        return super.isConditionValid() && BoundaryUtils.isInside(this.airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
    }
}
