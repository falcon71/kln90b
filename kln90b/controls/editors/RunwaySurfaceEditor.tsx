import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, RunwaySurfaceType, VNode} from "@microsoft/msfs-sdk";
import {RunwaySurfaceEditorField} from "./EditorField";

export class RunwaySurfaceEditor extends Editor<RunwaySurfaceType> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            new RunwaySurfaceEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}
        </span>);
    }

    protected convertFromValue(surface: RunwaySurfaceType): Rawvalue {
        return surface === RunwaySurfaceType.Asphalt ? [0] : [1];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = rawValue[0] === 0 ? RunwaySurfaceType.Asphalt : RunwaySurfaceType.Grass;
        return Promise.resolve(newValue);
    }
}