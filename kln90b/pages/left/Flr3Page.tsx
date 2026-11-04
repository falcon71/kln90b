import {PageProps} from "../Page";
import {ConfirmListItem} from "../../controls/ListItem";
import {FailureDefinition, FailureKey} from "../../failures/FailureCatalog";
import {FailureListPage} from "./FailureListPage";

/**
 * docs/failures.md, FLR 3: the failures that the aircraft can have and that are not active. ENT on an entry asks FAIL,
 * ENT fails it, also with the random failures off
 */
export class Flr3Page extends FailureListPage {

    readonly name: string = "FLR 3";

    constructor(props: PageProps) {
        super(props, "  INACTIVE");
    }

    protected entries(): FailureDefinition[] {
        return this.props.failures.inactiveList();
    }

    protected createItem(definition: FailureDefinition): ConfirmListItem<FailureKey> {
        return new ConfirmListItem<FailureKey>({
            bus: this.props.bus,
            value: definition.key,
            text: definition.flrName,
            prompt: "FAIL      ?",
            trigger: "enter",
            onConfirm: key => this.props.failures.fail(key),
        });
    }
}
