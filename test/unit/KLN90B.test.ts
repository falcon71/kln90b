import {afterEach, describe, expect, it, vi} from 'vitest';
// A static import: the first import of the adapter takes seconds (it pulls in the whole instrument), and inside a test
// that would run into the test timeout under load
import '../../kln90b/KLN90B';

afterEach(() => vi.restoreAllMocks());

// Contract tests; the source is the sim's BaseInstrument lifecycle that panel.cfg and panel.xml rely on (CLAUDE.md,
// "Public contract with aircraft"): the adapter is how the sim delivers H events and the panel.xml document to the unit.
// The harness's fake registerInstrument keeps the class that kln90b/KLN90B.tsx registers.
describe('KLN90B adapter (public contract)', () => {
    /** A new adapter around a real KLN90BCore on SIM_PLATFORM; nothing is initialized, so nothing is awaited */
    function adapter(): any {
        const Cls = (globalThis as any).__registeredInstruments.get('kln-90b');
        return new Cls();
    }

    it('registers the instrument as kln-90b', () => {
        expect((globalThis as any).__registeredInstruments.has('kln-90b')).toBe(true);
    });

    it('has the template id KLN90B that panel.cfg refers to', () => {
        expect(adapter().templateID).toBe('KLN90B');
    });

    it('forwards the H events the sim delivers to the core', () => {
        const inst = adapter();
        const forwarded = vi.spyOn(inst.core, 'onInteractionEvent').mockImplementation(() => {});

        inst.onInteractionEvent(['KLN90B_ENT_Push']);

        expect(forwarded).toHaveBeenCalledTimes(1);
        expect(forwarded).toHaveBeenCalledWith(['KLN90B_ENT_Push']);
    });

    it('initializes the core with the panel.xml document on Init', () => {
        const inst = adapter();
        const init = vi.spyOn(inst.core, 'init').mockImplementation(() => Promise.resolve());
        const doc = {marker: 'the panel.xml document'};
        inst.xmlConfig = doc;

        inst.Init();

        expect(init).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledWith(doc);
    });

    it('forwards the end of a sound to the core', () => {
        const inst = adapter();
        const ended = vi.spyOn(inst.core, 'onSoundEnd').mockImplementation(() => {});

        inst.onSoundEnd('a sound id');

        expect(ended).toHaveBeenCalledTimes(1);
        expect(ended).toHaveBeenCalledWith('a sound id');
    });
});
