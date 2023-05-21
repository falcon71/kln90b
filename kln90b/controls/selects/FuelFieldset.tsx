import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";


type TripFuelFieldsetTypes = {
    Fuel10000: SelectField;
    Fuel1000: SelectField;
    Fuel100: SelectField;
    Fuel10: SelectField;
    Fuel1: SelectField;
    Fuel01: SelectField;
}

const FUEL_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class TripFuelFieldset implements UiElement {


    readonly children: UIElementChildren<TripFuelFieldsetTypes>;

    constructor(private fuel: number, private readonly callback: (fuel: number) => void) {
        const FuelString = format(fuel, "00000.0");
        this.children = new UIElementChildren<TripFuelFieldsetTypes>({
            Fuel10000: new SelectField(FUEL_SET, Number(FuelString.substring(0, 1)), this.saveFuel10000.bind(this)),
            Fuel1000: new SelectField(FUEL_SET, Number(FuelString.substring(1, 2)), this.saveFuel1000.bind(this)),
            Fuel100: new SelectField(FUEL_SET, Number(FuelString.substring(2, 3)), this.saveFuel100.bind(this)),
            Fuel10: new SelectField(FUEL_SET, Number(FuelString.substring(3, 4)), this.saveFuel10.bind(this)),
            Fuel1: new SelectField(FUEL_SET, Number(FuelString.substring(4, 5)), this.saveFuel1.bind(this)),
            Fuel01: new SelectField(FUEL_SET, Number(FuelString.substring(6, 7)), this.saveFuel01.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("Fuel10000").render()}{this.children.get("Fuel1000").render()}{this.children.get("Fuel100").render()}{this.children.get("Fuel10").render()}{this.children.get("Fuel1").render()}.{this.children.get("Fuel01").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    private saveFuel10000(newFuel10000: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(newFuel10000 + oldFuel.substring(1));
        this.callback(this.fuel);
    }

    private saveFuel1000(newFuel1000: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 1) + newFuel1000 + oldFuel.substring(2));
        this.callback(this.fuel);
    }

    private saveFuel100(newFuel100: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 2) + newFuel100 + oldFuel.substring(3));
        this.callback(this.fuel);
    }

    private saveFuel10(newFuel10: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 3) + newFuel10 + oldFuel.substring(4));
        this.callback(this.fuel);
    }

    private saveFuel1(newFuel1: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 4) + newFuel1 + oldFuel.substring(5));
        this.callback(this.fuel);

    }

    private saveFuel01(newFuel01: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 6) + newFuel01);
        this.callback(this.fuel);

    }

}


type OthFuelFieldsetTypes = {
    Fuel10000: SelectField;
    Fuel1000: SelectField;
    Fuel100: SelectField;
    Fuel10: SelectField;
    Fuel1: SelectField;
}

export class OthFuelFieldset implements UiElement {


    readonly children: UIElementChildren<OthFuelFieldsetTypes>;

    constructor(private fuel: number, private readonly callback: (fuel: number) => void) {
        const FuelString = format(fuel, "00000");
        this.children = new UIElementChildren<TripFuelFieldsetTypes>({
            Fuel10000: new SelectField(FUEL_SET, Number(FuelString.substring(0, 1)), this.saveFuel10000.bind(this)),
            Fuel1000: new SelectField(FUEL_SET, Number(FuelString.substring(1, 2)), this.saveFuel1000.bind(this)),
            Fuel100: new SelectField(FUEL_SET, Number(FuelString.substring(2, 3)), this.saveFuel100.bind(this)),
            Fuel10: new SelectField(FUEL_SET, Number(FuelString.substring(3, 4)), this.saveFuel10.bind(this)),
            Fuel1: new SelectField(FUEL_SET, Number(FuelString.substring(4, 5)), this.saveFuel1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("Fuel10000").render()}{this.children.get("Fuel1000").render()}{this.children.get("Fuel100").render()}{this.children.get("Fuel10").render()}{this.children.get("Fuel1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    private saveFuel10000(newFuel10000: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(newFuel10000 + oldFuel.substring(1));
        this.callback(this.fuel);
    }

    private saveFuel1000(newFuel1000: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 1) + newFuel1000 + oldFuel.substring(2));
        this.callback(this.fuel);
    }

    private saveFuel100(newFuel100: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 2) + newFuel100 + oldFuel.substring(3));
        this.callback(this.fuel);
    }

    private saveFuel10(newFuel10: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 3) + newFuel10 + oldFuel.substring(4));
        this.callback(this.fuel);
    }

    private saveFuel1(newFuel1: number): void {
        const oldFuel = format(this.fuel, "00000.0");
        this.fuel = Number(oldFuel.substring(0, 4) + newFuel1 + oldFuel.substring(5));
        this.callback(this.fuel);

    }

}