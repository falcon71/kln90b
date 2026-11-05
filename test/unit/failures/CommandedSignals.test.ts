import {describe, expect, it} from 'vitest';
import {CommandedSignals} from '../../../kln90b/Interconnect';

describe('CommandedSignals (#459)', () => {
    it('take is false before any record', () => {
        const c = new CommandedSignals();
        expect(c.take('msg', true)).toBe(false);
        expect(c.take('msg', false)).toBe(false);
    });

    it('a recorded command is taken once', () => {
        const c = new CommandedSignals();
        c.record('msg', true);
        expect(c.take('msg', false)).toBe(false);
        expect(c.take('msg', true)).toBe(true);
        expect(c.take('msg', true)).toBe(false);
    });

    it('on and off recorded between two takes are both true', () => {
        const c = new CommandedSignals();
        c.record('arm', true);
        c.record('arm', false);
        expect(c.take('arm', true)).toBe(true);
        expect(c.take('arm', false)).toBe(true);
    });

    it('clear drops both', () => {
        const c = new CommandedSignals();
        c.record('wpt', true);
        c.record('wpt', false);
        c.clear();
        expect(c.take('wpt', true)).toBe(false);
        expect(c.take('wpt', false)).toBe(false);
    });

    it('signals are independent', () => {
        const c = new CommandedSignals();
        c.record('superflag', true);
        expect(c.take('actv', true)).toBe(false);
        expect(c.take('superflag', true)).toBe(true);
    });
});
