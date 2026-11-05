import {PageProps} from "../Page";
import {ConfirmListItem} from "../../controls/ListItem";
import {FailureDefinition, FailureKey} from "../../failures/FailureCatalog";
import {FailureListPage} from "./FailureListPage";

/**
 * docs/failures.md, FLR 2: the failures that are active. CLR on an entry asks REPAIR, ENT repairs
 */
export class Flr2Page extends FailureListPage {

    readonly name: string = "FLR 2";

    constructor(props: PageProps) {
        super(props, "  ACTIVE");
    }

    protected entries(): FailureDefinition[] {
        return this.props.failures.activeList();
    }

    protected createItem(definition: FailureDefinition): ConfirmListItem<FailureKey> {
        return new ConfirmListItem<FailureKey>({
            bus: this.props.bus,
            value: definition.key,
            text: definition.flrName,
            prompt: "REPAIR    ?",
            trigger: "clear",
            onConfirm: key => this.props.failures.repair(key),
        });
    }
}
