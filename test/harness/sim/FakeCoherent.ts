import {FakeSim} from './FakeSim';

export interface CoherentCall {
    name: string;
    args: unknown[];
}

const SET_VALUE_REG = new Set(['setValueReg_Number', 'setValueReg_Bool', 'setValueReg_String']);

/**
 * Coherent and the view listeners. SimVar writes are routed to FakeSim; every other call is recorded and, unless a
 * reply is configured, never resolves, like a sim with nothing attached.
 */
export class FakeCoherent {
    public readonly calls: CoherentCall[] = [];
    public readonly replies = new Map<string, (...args: unknown[]) => unknown>();

    constructor(private readonly sim: FakeSim) {
    }

    public reset(): void {
        this.calls.length = 0;
        this.replies.clear();
    }

    public install(g: any): void {
        const call = (name: string, ...args: unknown[]): Promise<unknown> => {
            if (SET_VALUE_REG.has(name)) {
                this.sim.writeReg(args[0] as number, args[1] as number | boolean | string);
                return Promise.resolve();
            }
            this.calls.push({name, args});
            const reply = this.replies.get(name);
            return reply ? Promise.resolve(reply(...args)) : new Promise(() => undefined);
        };
        g.Coherent = {call, on: () => ({clear: () => undefined}), off: () => undefined, trigger: () => undefined};
        g.RegisterViewListener = () => ({
            on: () => undefined, off: () => undefined, call, trigger: () => undefined, unregister: () => undefined,
        });
    }
}
