import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NorthSouthEditorField, NumberEditorField} from "./EditorField";
import {Latitude} from "../../data/Units";
import {format} from "numerable";

export class LatitudeEditor extends Editor<Latitude> {

    constructor(bus: EventBus, value: Latitude | null, enterCallback: (text: Latitude) => void) {
        super(bus, [
            new NorthSouthEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
            NumberEditorField.createWithMinMax(0, 5),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()} {this.editorFields[1].render()}{this.editorFields[2].render()}°{this.editorFields[3].render()}{this.editorFields[4].render()}.{this.editorFields[5].render()}{this.editorFields[6].render()}
        </span>);
    }

    protected convertFromValue(value: Latitude): Rawvalue {
        const northSountIdx = value > 0 ? 0 : 1;
        value = Math.abs(value);
        const degreesString = format(value, "00", {rounding: "floor"});


        const minutes = (value % 1) * 60;
        const minutesString = format(minutes, "00.00");

        return [
            northSountIdx,
            Number(String(degreesString).substring(0, 1)),
            Number(String(degreesString).substring(1, 2)),
            Number(String(minutesString).substring(0, 1)),
            Number(String(minutesString).substring(1, 2)),
            Number(String(minutesString).substring(3, 4)),
            Number(String(minutesString).substring(4, 5)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<Latitude | null> {
        const northSouth = rawValue[0] === 0 ? 1 : -1;
        const degrees = Number(String(rawValue[1]) + String(rawValue[2]));
        if (degrees > 90) {
            return Promise.resolve(null);
        }
        const minutes = Number(String(rawValue[3]) + String(rawValue[4]) + "." + String(rawValue[5]) + String(rawValue[6]));


        return Promise.resolve(northSouth * (degrees + minutes / 60));
    }


}