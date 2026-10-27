import {HEvent, Publisher, SimVarValueType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettingsTypes} from "./settings/KLN90BUserSettings";
import {EVT_BRT_DEC, EVT_BRT_INC, EVT_POWER, EVT_POWER_OFF, EVT_POWER_ON} from "./HEvents";
import {BrightnessManager} from "./BrightnessManager";
import {WelcomePage, WelcomePageProps} from "./pages/WelcomePage";
import {NullPage} from "./pages/NullPage";
import {PageProps} from "./pages/Page";
import {PropsReadyEvent} from "./KLN90BCore";
import {LVAR_POWER} from "./LVars";
import {HOURS_TO_SECONDS} from "./data/navdata/NavCalculator";

/**
 * How long the unit's battery module carries a loss of the aircraft power, in milliseconds. The maintenance manual
 * guarantees about 1 s of carry (PDF 53, 54, 107) and describes the switch-over circuit that gives up after about
 * 1.5 s (PDF 79). That value is nominal, so it is taken as it is: no tolerance, no randomness.
 */
export const RIDE_THROUGH_TIME = 1500;

export interface PowerEventData {
    isPowered: boolean,
    timeSincePowerChange: number, //milliseconds
}


export interface PowerEvent {
    powerEvent: PowerEventData;
}

/**
 * Models the unit's power path: the BRT/PUSH ON knob (ON/OFF and the brightness events it carries), the aircraft power
 * and the battery module (maintenance manual PDF 53, 54).
 */
export class PowerSupply {


    private powerSwitchOn: boolean = false; //State of the knob
    private electricityAvailable: boolean = true; //State of the electrical system / circuit braker, as applied: a loss waits for the ride-through
    private hasElectricityReading: boolean = false; //Set by the first call of setElectricityAvailable
    private rideThrough: number | null = null; //Timer of a running ride-through
    private isPowered: boolean = false; //If the device is actually on or off

    private readonly isPoweredPublisher: Publisher<PowerEvent>;
    private readonly powerCyclesSettings: UserSetting<NonNullable<KLN90BUserSettingsTypes["powercycles"]>>;
    private lastPowerChangeTime: number = Date.now() - HOURS_TO_SECONDS * 1000;


    constructor(private props: WelcomePageProps | PageProps, private readonly brightnessManager: BrightnessManager) {

        const hEvent = this.props.bus.getSubscriber<HEvent>();
        hEvent.on('hEvent').handle((e: string) => {
            switch (e) {
                case EVT_BRT_INC:
                    this.brightnessManager.incBrightness();
                    break;
                case EVT_BRT_DEC:
                    this.brightnessManager.decBrightness();
                    break;
                case EVT_POWER:
                    this.togglePowerSwitch();
                    break;
                case EVT_POWER_ON:
                    this.setPowerOn();
                    break;
                case EVT_POWER_OFF:
                    this.setPowerOff();
                    break;
            }
        });

        this.isPoweredPublisher = this.props.bus.getPublisher<PowerEvent>();

        this.powerCyclesSettings = this.props.userSettings.getSetting("powercycles");

        //Real unit: fictional as a signal. L:KLN90B_Power is the position of the front-panel power knob, which has no
        //connector pin. The supply itself is P901 pin 40 (Input.ElectricitySimVar, SimVarSync)
        SimVar.SetSimVarValue(LVAR_POWER, SimVarValueType.Bool, this.powerSwitchOn);

        this.props.bus.getSubscriber<PropsReadyEvent>().on("propsReady").handle(this.handlePropsReady.bind(this));
    }

    handlePropsReady(props: PageProps) {
        this.props = props;
    }

    /**
     * Takes the reading of the aircraft power (the ElectricitySimVar of panel.xml).
     *
     * A loss while the unit is running is carried by the battery module for RIDE_THROUGH_TIME (maintenance manual PDF
     * 53, 54, 79, 107): the unit goes on running, with no page change, no power event and no power cycle. Power coming
     * back in that time ends the ride-through and nothing happened. Each loss gets the full time, there is no charge
     * model.
     */
    public setElectricityAvailable(electricityAvailable: boolean): void {
        if (!this.hasElectricityReading) {
            //The first reading applies at once: a unit that loads without power must not run a ride-through for a loss
            //that did not happen
            this.hasElectricityReading = true;
            this.applyElectricityAvailable(electricityAvailable);
            return;
        }

        if (electricityAvailable) {
            this.cancelRideThrough();
            this.applyElectricityAvailable(true);
            return;
        }

        if (this.rideThrough !== null || !this.electricityAvailable) {
            return; //Already carried, or already applied
        }

        if (!this.isPowered) {
            //Nothing runs on the battery module while the knob is off: there is nothing to carry (PDF 53, 54)
            this.applyElectricityAvailable(false);
            return;
        }

        this.rideThrough = window.setTimeout(() => {
            //The switch-over gave up (PDF 79): the unit is off, and the off time counts from now
            this.rideThrough = null;
            this.applyElectricityAvailable(false);
        }, RIDE_THROUGH_TIME);
    }

    private cancelRideThrough(): void {
        if (this.rideThrough !== null) {
            window.clearTimeout(this.rideThrough);
            this.rideThrough = null;
        }
    }

    private applyElectricityAvailable(electricityAvailable: boolean): void {
        if (electricityAvailable === this.electricityAvailable) {
            return;
        }

        console.log("electricityAvailable", electricityAvailable);

        this.electricityAvailable = electricityAvailable;
        this.refreshPowerState();
    }

    private togglePowerSwitch() {
        this.setPowerSwitch(!this.powerSwitchOn);
    }

    private setPowerOn() {
        this.setPowerSwitch(true);
    }

    private setPowerOff() {
        this.setPowerSwitch(false);
    }

    /**
     * When the flight is not loaded cold and dark, then this forces the device on.
     * We assume that it was startet before, as such the screen must be warm.
     * Only works if it actually receives electricity.
     */
    public forceReadyToUse() {
        this.lastPowerChangeTime = Date.now(); //Forces the screen to be warm
        this.setPowerSwitch(true);
    }

    public setPowerSwitch(powerSwitchOn: boolean): void {
        if (this.powerSwitchOn === powerSwitchOn) {
            return;
        }

        console.log("Power", powerSwitchOn);
        this.powerSwitchOn = powerSwitchOn;

        if (!powerSwitchOn && this.rideThrough !== null) {
            //The knob acts at once: the unit goes off, which ends the ride-through. The loss it was carrying is a loss
            //for good, otherwise the knob would power the unit again from a supply that is gone (PDF 53, 54)
            this.cancelRideThrough();
            this.electricityAvailable = false;
        }

        //Real unit: fictional, the power knob's position (see the constructor)
        SimVar.SetSimVarValue(LVAR_POWER, SimVarValueType.Bool, powerSwitchOn);
        this.refreshPowerState();
    }

    private refreshPowerState(): void {
        const isPowered = this.powerSwitchOn && this.electricityAvailable;
        if (this.isPowered === isPowered) {
            return;
        }

        this.isPowered = isPowered;

        const now = Date.now();
        const timePoweredOff = now - this.lastPowerChangeTime;
        if (isPowered) {
            this.powerCyclesSettings.set(this.powerCyclesSettings.value + 1);
            console.log("Powercycles: ", this.powerCyclesSettings.value);
            this.props.pageManager.setCurrentPage(WelcomePage, this.props);
        } else {
            this.props.pageManager.setCurrentPage(NullPage, {});
        }
        this.isPoweredPublisher.pub("powerEvent", {
            isPowered: isPowered,
            timeSincePowerChange: timePoweredOff,
        });
        this.lastPowerChangeTime = now;
    }
}