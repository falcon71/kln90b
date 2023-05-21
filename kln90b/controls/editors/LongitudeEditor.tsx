import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {EastWestEditorField, NumberEditorField} from "./EditorField";
import {Longitude} from "../../data/Units";
import {format} from "numerable";


export class LongitudeEditor extends Editor<Longitude> {

    constructor(bus: EventBus, value: Longitude | null, enterCallback: (text: Longitude) => void = () => {
    }) {
        super(bus, [
            new EastWestEditorField(),
            NumberEditorField.createWithBlankMax(1),
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
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}°{this.editorFields[4].render()}{this.editorFields[5].render()}.{this.editorFields[6].render()}{this.editorFields[7].render()}
        </span>);
    }

    protected convertFromValue(value: Longitude): Rawvalue {
        const eastWestIndex = value > 0 ? 0 : 1;
        value = Math.abs(value);
        const degreesString = format(value, "000", {rounding: "floor"});


        const minutes = (value % 1) * 60;
        const minutesString = format(minutes, "00.00");

        return [
            eastWestIndex,
            Number(String(degreesString).substring(0, 1)),
            Number(String(degreesString).substring(1, 2)),
            Number(String(degreesString).substring(2, 3)),
            Number(String(minutesString).substring(0, 1)),
            Number(String(minutesString).substring(1, 2)),
            Number(String(minutesString).substring(3, 4)),
            Number(String(minutesString).substring(4, 5)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<Longitude | null> {
        const eastWest = rawValue[0] === 0 ? 1 : -1;
        const degrees = Number(String(rawValue[1]) + String(rawValue[2]) + String(rawValue[3]));
        if (degrees > 180) {
            return Promise.resolve(null);
        }
        const minutes = Number(String(rawValue[4]) + String(rawValue[5]) + "." + String(rawValue[6]) + String(rawValue[7]));

        return Promise.resolve(eastWest * (degrees + minutes / 60));

    }

}