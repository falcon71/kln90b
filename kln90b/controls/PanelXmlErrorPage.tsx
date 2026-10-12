import {ComponentProps, DisplayComponent, EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";


export interface PanelXmlErrorEvent {
    /**
     * One line for each invalid panel.xml value (KLN90BPlaneSettingsParser.problems)
     */
    panelXmlErrors: string[];
}

export interface PanelXmlErrorPageProps extends ComponentProps {
    bus: EventBus;
}

/**
 * Shows the invalid panel.xml values to the aircraft developer (#145). The unit keeps running with the defaults, so OK
 * only closes the page. Not part of the real unit
 */
export class PanelXmlErrorPage extends DisplayComponent<PanelXmlErrorPageProps> {

    private containerRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private messageRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private okRef: NodeReference<HTMLButtonElement> = FSComponent.createRef<HTMLButtonElement>();

    constructor(props: PanelXmlErrorPageProps) {
        super(props);

        props.bus.getSubscriber<PanelXmlErrorEvent>().on("panelXmlErrors").handle(this.showProblems.bind(this));
    }

    render(): VNode {
        return (<div ref={this.containerRef} class="panelxmlerrorpage d-none">
            <div class="errorheader">The panel.xml configuration of the KLN 90B has invalid values. The defaults are
                used instead:
            </div>
            <div class="errormessage" ref={this.messageRef}></div>
            <div class="errorButtons">
                <button ref={this.okRef} type="button">OK</button>
            </div>
        </div>);
    }

    public onAfterRender(thisNode: VNode): void {
        this.okRef.instance.onclick = this.ok.bind(this);
    }

    private showProblems(problems: string[]) {
        this.messageRef.instance.innerHTML = "";
        for (const problem of problems) {
            const line = document.createElement("div");
            line.textContent = problem;
            this.messageRef.instance.appendChild(line);
        }
        this.containerRef.instance.classList.remove("d-none");
    }

    private ok() {
        this.containerRef.instance.classList.add("d-none");
    }
}
