import {HEvent, Publisher, SimVarValueType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettingsTypes} from "./settings/KLN90BUserSettings";
import {EVT_BRT_DEC, EVT_BRT_INC, EVT_POWER, EVT_POWER_OFF, EVT_POWER_ON} from "./HEvents";
import {BrightnessManager} from "./BrightnessManager";
import {WelcomePage, WelcomePageProps} from "./pages/WelcomePage";
import {NullPage} from "./pages/NullPage";
import {PageProps} from "./pages/Page";
import {PropsReadyEvent} from "./KLN90B";
import {LVAR_POWER} from "./LVars";
import {HOURS_TO_SECONDS} from "./data/navdata/NavCalculator";

export interface PowerEventData {
    isPowered: boolean,
    timeSincePowerChange: number, //milliseconds
}


export interface PowerEvent {
    powerEvent: PowerEventData;
}

export class PowerButton {


    private readonly brightnessManager: BrightnessManager;

    private powerSwitchOn: boolean = false; //State of the knob
    private electricityAvailable: boolean = true; //State of the electrical system / circuit braker
    private isPowered: boolean = false; //If the device is actually on or off

    private readonly isPoweredPublisher: Publisher<PowerEvent>;
    private readonly powerCyclesSettings: UserSetting<NonNullable<KLN90BUserSettingsTypes["powercycles"]>>;
    private lastPowerChangeTime: number = Date.now() - HOURS_TO_SECONDS * 1000;


    constructor(private props: WelcomePageProps | PageProps) {
        this.brightnessManager = new BrightnessManager(props.bus, props.planeSettings);

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

        SimVar.SetSimVarValue(LVAR_POWER, SimVarValueType.Bool, this.powerSwitchOn);

        this.props.bus.getSubscriber<PropsReadyEvent>().on("propsReady").handle(this.handlePropsReady.bind(this));
    }

    handlePropsReady(props: PageProps) {
        this.props = props;
    }

    public setElectricityAvailable(electricityAvailable: boolean): void {
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