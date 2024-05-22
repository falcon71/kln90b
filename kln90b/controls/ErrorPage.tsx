import {ComponentProps, DisplayComponent, EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {VERSION} from "../Version";


export interface ErrorEvent {
    error: Error;
}

export interface ErrorPageProps extends ComponentProps {
    bus: EventBus;
}

/**
 * This class is needed, so the keyboard is always available and retains its state if the active page changes
 */
export class ErrorPage extends DisplayComponent<ErrorPageProps> {

    private containerRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private errorRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private okRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private okSuppressRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private showErrors: boolean = true;


    constructor(props: ErrorPageProps) {
        super(props);

        props.bus.getSubscriber<ErrorEvent>().on("error").handle(this.showError.bind(this));
    }


    render(): VNode {
        return (<div ref={this.containerRef} class="errorpage d-none">
            <div class="errorheader">An error occured. Please report at https://github.com/falcon71/kln90b or on
                Discord:
            </div>
            <div class="errormessage" ref={this.errorRef}></div>
            <div class="errorButtons">
                <button ref={this.okRef} type="button">OK</button>
                <div>{VERSION}</div>
                <button ref={this.okSuppressRef} type="button">OK and suppress further errors
                </button>
            </div>
        </div>);
    }

    public showError(error: Error) {
        if (this.showErrors) {
            this.errorRef.instance.innerHTML = error.toString() + "<br>" + error.stack;
            this.containerRef.instance.classList.remove("d-none")
        }
    }

    public onAfterRender(thisNode: VNode): void {
        this.okRef.instance.onclick = this.ok.bind(this);
        this.okSuppressRef.instance.onclick = this.okAndSurpress.bind(this);
    }

    public ok() {
        this.containerRef.instance.classList.add("d-none")
    }

    public okAndSurpress() {
        this.showErrors = false;
        this.containerRef.instance.classList.add("d-none")
    }
}