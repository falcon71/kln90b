import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, MINIMAL_PANEL_XML} from '../harness/boot';
import {NavCalculator} from '../../kln90b/data/navdata/NavCalculator';
import {AirspaceAlert} from '../../kln90b/data/navdata/AirspaceAlert';
import {HtAboveAirportAlert} from '../../kln90b/services/HtAboveAirportAlert';
import {AltAlert} from '../../kln90b/services/AltAlert';
import {Timers} from '../../kln90b/services/Timers';
import {RollSteeringController} from '../../kln90b/services/RollSteeringController';
import {SignalOutputFillterTick} from '../../kln90b/services/SignalOutputFillterTick';

const SAMPLE_PANEL_XML = readFileSync('cfg/panel.xml', 'utf8');

/**
 * The members of PageProps, the services bag every page and control receives, as docs/architecture.md (Core 1) lists
 * them, in that order. Sorted for the comparison
 */
const PAGE_PROPS = ['ref', 'bus', 'userSettings', 'planeSettings', 'sensors', 'pageManager', 'messageHandler',
    'hardware', 'memory', 'facilityLoader', 'facilityRepository', 'nearestLists', 'nearestUtils', 'remarksManager',
    'scanLists', 'msa', 'vnav', 'modeController', 'database', 'magvar', 'sidstar'];

// Public contract: cfg/panel.xml is the documented sample that aircraft developers copy (CLAUDE.md, "Public contract
// with aircraft"; the wiki page panel.xml customization), and docs/architecture.md (Core 1) lists what KLN90BCore.init
// builds into PageProps. The sample sets ElectricitySimVar CIRCUIT ON:1, so its circuit is closed, or the unit would
// lose power at the first SimVarSync tick and stop its ticks.
describe('KLN90BCore.init, sample and minimal panel.xml (spec: public contract, docs/architecture.md Core 1)', () => {
    const cases = [
        {name: 'the sample cfg/panel.xml', panelXml: SAMPLE_PANEL_XML},
        {name: 'the minimal panel.xml', panelXml: MINIMAL_PANEL_XML},
    ];

    it.each(cases)('builds every member of PageProps with $name', async ({panelXml}) => {
        const unit = await bootUnit({panelXml, simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: true}]});

        expect(Object.keys(unit.props).sort()).toEqual([...PAGE_PROPS].sort());
        const props = unit.props as any;
        const unset = PAGE_PROPS.filter(key => props[key] === undefined || props[key] === null);
        expect(unset).toEqual([]);
    });

    it.each(cases)('starts and runs ten seconds with $name without an error or a console.error', async ({panelXml}) => {
        const unit = await bootUnit({panelXml, simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: true}]});

        await vi.advanceTimersByTimeAsync(10_000);

        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
        // Still powered and on a main page (a powered-off unit shows the NullPage, whose name is blank)
        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        expect(unit.props.pageManager.getCurrentPage().leftPageName()).toBe('NAV 2');
    });
});

// docs/architecture.md, Core 2: the calculation tickables run in the order sensors, magvar, the NDB, APT and VOR
// nearest lists, modeController, NavCalculator, airspaceAlert, HtAboveAirportAlert, AltAlert, Timers, vnav,
// messageHandler, RollSteeringController, and "the order matters"; the signal loop runs SignalOutputFillterTick alone.
// The order is read from the TickController that KLN90BCore.init built; the services in PageProps are compared by
// identity, the others by class.
describe('the order of the calculation tickables (spec, docs/architecture.md Core 2)', () => {
    it('runs the calculation tickables in the documented order', async () => {
        const unit = await bootUnit();
        const p = unit.props;
        const tickController = (unit.core as any).tickManager;

        const name = (t: unknown): string => {
            const byIdentity: [unknown, string][] = [
                [p.sensors, 'sensors'], [p.magvar, 'magvar'],
                [p.nearestLists.ndbNearestList, 'ndbNearestList'], [p.nearestLists.aptNearestList, 'aptNearestList'],
                [p.nearestLists.vorNearestList, 'vorNearestList'], [p.modeController, 'modeController'],
                [p.vnav, 'vnav'], [p.messageHandler, 'messageHandler'],
            ];
            const known = byIdentity.find(([service]) => service === t);
            if (known !== undefined) return known[1];
            const byClass: [Function, string][] = [
                [NavCalculator, 'NavCalculator'], [AirspaceAlert, 'airspaceAlert'],
                [HtAboveAirportAlert, 'HtAboveAirportAlert'], [AltAlert, 'AltAlert'], [Timers, 'Timers'],
                [RollSteeringController, 'RollSteeringController'],
                [SignalOutputFillterTick, 'SignalOutputFillterTick'],
            ];
            return byClass.find(([cls]) => t instanceof cls)?.[1] ?? 'unknown';
        };

        expect(tickController.calcTickables.map(name)).toEqual([
            'sensors', 'magvar', 'ndbNearestList', 'aptNearestList', 'vorNearestList', 'modeController',
            'NavCalculator', 'airspaceAlert', 'HtAboveAirportAlert', 'AltAlert', 'Timers', 'vnav', 'messageHandler',
            'RollSteeringController',
        ]);
        expect(tickController.signalTickables.map(name)).toEqual(['SignalOutputFillterTick']);
        expect(tickController.displayTickables).toEqual([p.pageManager]);
    });
});
