import {Facility, FixTypeFlags, FlightPlanRouteUtils, ICAO, ReadonlyFlightPlanRoute} from '@microsoft/msfs-sdk';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport, intersection} from '../../harness/navdata/builders';
import {approach, Leg, sid, star, withProcedures} from '../../harness/navdata/procedures';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {APR_ARM_SWITCH, NO_GPS_SIMVARS, panelXml} from '../../harness/panelXml';
import {activeIdent, fplIdents, turnStackLength} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

async function bootWithRoute(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
    await settle(unit);
    unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.5, lon: 8.5}]}));
    await vi.advanceTimersByTimeAsync(2000);
    return unit;
}

// KlnEfbSaver sends FPL 0 to the EFB on request. The source is the SDK's FlightPlanRouteManager contract (the EFB route
// sync) and the issue, not a manual page.
describe('KlnEfbSaver', () => {
    it('answers a route request with the airports of FPL 0 as departure and destination', async () => {
        const unit = await bootWithRoute();
        expect(fplIdents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        const route = unit.efb!.replies[0].route;
        expect(route.departureAirport.ident).toBe('KAAA');
        expect(route.destinationAirport.ident).toBe('KBBB');
        expect(route.enroute.map(leg => [leg.lat, leg.lon])).toEqual([[47.5, 8.5]]);
    });

    // Building the route must not take the airports off the leg array of FPL 0 (#91)
    it('a route request leaves FPL 0 unchanged (#91)', async () => {
        const unit = await bootWithRoute();

        unit.efb!.request();

        expect(fplIdents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);
    });

    // The answer does not depend on how often the EFB asks: the second request gets the same route as the first
    it('answers a second route request with the same route as the first (#91)', async () => {
        const unit = await bootWithRoute();

        unit.efb!.request();
        unit.efb!.request();

        const [first, second] = unit.efb!.replies;
        expect(unit.efb!.replies.length).toBe(2);
        expect(second.route).toEqual(first.route);
        expect(first.route.departureAirport.ident).toBe('KAAA');
        expect(first.route.destinationAirport.ident).toBe('KBBB');
    });

    // The whole state of FPL 0 survives a request: the legs themselves (the same objects in the same order), the active
    // waypoint, the turn stack and the loaded procedures, and nothing is published about FPL 0, so the planner sync and
    // the persistence see no change (#91)
    it('a route request leaves the legs, the active waypoint and the procedures of FPL 0 as they were (#91)', async () => {
        const unit = await bootWithStarAndApproach09();
        const fpl0 = unit.props.memory.fplPage.flightplans[0];
        const legsBefore = [...fpl0.getLegs()];
        const typesBefore = legsBefore.map(l => l.type);
        const activeBefore = activeIdent(unit);
        const stackBefore = turnStackLength(unit);
        expect(legsBefore.length).toBe(7); // Precondition: ENRAA, the STAR, the approach and KPRC
        expect(new Set(typesBefore).size).toBeGreaterThan(1); // Precondition: procedure legs and user legs
        // A new bus subscriber is called at once with the last cached event, which is not a change made by the request
        const changes: unknown[] = [];
        let subscribed = false;
        unit.props.bus.getSubscriber<any>().on('flightplanChanged').handle((fpl: unknown) => subscribed && changes.push(fpl));
        subscribed = true;

        unit.efb!.request();
        await vi.advanceTimersByTimeAsync(2000);

        expect(changes).toEqual([]);
        expect(fpl0.getLegs().length).toBe(legsBefore.length);
        fpl0.getLegs().forEach((leg, i) => expect(leg).toBe(legsBefore[i]));
        expect(fpl0.getLegs().map(l => l.type)).toEqual(typesBefore);
        expect(activeIdent(unit)).toBe(activeBefore);
        expect(turnStackLength(unit)).toBe(stackBefore);
    });

    // The first leg is no airport: it stays in the enroute part, and only the destination is taken off
    it('answers a plan that starts with a VOR and ends with an airport, and leaves FPL 0 unchanged (#91)', async () => {
        const {abc, kbbb} = standardRoute();
        const unit = await bootUnit({efb: true, facilities: [abc, kbbb], storage: savedFlightplan(0, [abc, kbbb])});
        await settle(unit);

        const route = requestRoute(unit);

        expect(ICAO.isValueEmpty(route.departureAirport)).toBe(true);
        expect(route.destinationAirport.ident).toBe('KBBB');
        expect(route.enroute.map(l => l.fixIcao.ident)).toEqual(['ABC']);
        expect(fplIdents(unit)).toEqual(['ABC', 'KBBB']);
    });

    // A plan of two airports has no enroute leg; both are taken for the route and both stay in FPL 0
    it('answers a plan of two airports and leaves FPL 0 unchanged (#91)', async () => {
        const unit = await bootUnit({efb: true, facilities: [kaaa, kbbb], storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);

        const route = requestRoute(unit);

        expect(route.departureAirport.ident).toBe('KAAA');
        expect(route.destinationAirport.ident).toBe('KBBB');
        expect(route.enroute).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    // The preconditions of the two tests below: an empty FPL 0, and one that holds only an airport after a synced route
    it('starts from an empty FPL 0, and from one that holds only an airport after a synced route', async () => {
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        expect(fplIdents(unit)).toEqual([]);

        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA']);
    });

    // The route of an empty plan is the SDK's empty route, as the SDK's own avionics answer a plan without legs
    it('a route request with an empty FPL 0 is answered with an empty route (#91)', async () => {
        const unit = await bootUnit({efb: true});
        await settle(unit);
        expect(fplIdents(unit)).toEqual([]);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        expect(unit.efb!.replies[0].route).toEqual(FlightPlanRouteUtils.emptyRoute());
        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
    });

    // A plan with a single airport: the airport is the departure, and there is nothing left for a destination
    it('a route request with only an airport in FPL 0 is answered (#91)', async () => {
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(fplIdents(unit)).toEqual(['KAAA']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        const route = unit.efb!.replies[0].route;
        expect(route.departureAirport.ident).toBe('KAAA');
        expect(ICAO.isValueEmpty(route.destinationAirport)).toBe(true);
        expect(route.enroute).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA']);
        expect(unit.consoleErrors).toEqual([]);
    });
});

/** Asks for the route and returns the one answer */
function requestRoute(unit: HeadlessUnit): ReadonlyFlightPlanRoute {
    const id = unit.efb!.request();
    expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
    return unit.efb!.replies[0].route;
}

/** KPRC with the STAR ARR1 (transition ENRAA) and an RNAV approach to runway 09, east of the airport; FPL 0 is ENRAA, KPRC */
async function bootWithStarAndApproach09(): Promise<HeadlessUnit> {
    const enraa = intersection('ENRAA', 47.0, 8.8);
    const arraa = intersection('ARRAA', 47.0, 8.4);
    const fafaa = intersection('FAFAA', 47.0, 7.9);
    const mapaa = intersection('MAPAA', 47.0, 7.95);
    const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
        arrivals: [star('ARR1', {transitions: [{name: 'ENRAA', legs: [Leg.IF(enraa), Leg.TF(arraa)]}], common: [Leg.TF(fafaa)]})],
        approaches: [approach({type: ApproachType.APPROACH_TYPE_RNAV, runway: '09', final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)]})],
    });
    const unit = await bootUnit({
        facilities: [kprc, enraa, arraa, fafaa, mapaa], efb: true, position: {lat: 47.0, lon: 9.0}, storage: savedFlightplan(0, [enraa, kprc]),
        panelXml: panelXml(APR_ARM_SWITCH),
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 7');
    await unit.panel.loadProcedure('APT 8');
    return unit;
}

// The route the unit answers with is the SDK's FlightPlanRoute (msfs-sdk FlightPlanRoute.ts; the EFB route sync of
// CLAUDE.md "Public contract with aircraft"): an enroute leg names a database fix by its ICAO, or a point by
// hasLatLon, lat and lon; procedures are given by name, with the runway as the SDK's RunwayIdentifier and the approach
// as its ApproachIdentifier. The SDK's own avionics fill these fields the same way (GarminFlightPlanRouteUtils).
describe('KlnEfbSaver route contents', () => {
    it('sends a database fix by its ICAO, without a position', async () => {
        const {abc} = standardRoute();
        const unit = await bootOnStandardRoute({efb: true});

        const route = requestRoute(unit);

        expect(route.enroute.length).toBe(1);
        expect(ICAO.valueToStringV2(route.enroute[0].fixIcao)).toBe(ICAO.valueToStringV2(abc.icaoStruct));
        expect(route.enroute[0].hasLatLon).toBe(false);
    });

    it('sends a user waypoint by its position, named by its user ICAO', async () => {
        const farm = {icaoStruct: ICAO.value('U', 'XX', '', 'FARM')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]), ...savedFlightplan(0, [kaaa, farm, kbbb])},
        });
        await settle(unit);
        expect(fplIdents(unit)).toEqual(['KAAA', 'FARM', 'KBBB']); // Precondition: restored

        const route = requestRoute(unit);

        expect(route.enroute.map(l => [l.hasLatLon, ICAO.valueToStringV2(l.fixIcao)])).toEqual([[true, 'UXX        FARM    ']]);
        expect(route.enroute[0].lat).toBeCloseTo(47.2, 6);
        expect(route.enroute[0].lon).toBeCloseTo(8.1, 6);
    });

    it('sends the approach by type, runway and transition, with its airport as the destination', async () => {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, efb: true, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc]),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(fplIdents(unit)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']); // Precondition

        const route = requestRoute(unit);

        expect(route.destinationAirport.ident).toBe('KPRC');
        expect(route.enroute.map(l => l.fixIcao.ident)).toEqual(['ENRAA']);
        expect(route.approach.type).toBe('RNAV');
        expect(route.approach.runway.number).toBe('18');
        expect(route.approach.runway.designator).toBe('');
        expect(route.approachTransition).toBe('IAFAA');
    });

    it('sends the SID by name and runway, with its airport as the departure', async () => {
        const depaa = intersection('DEPAA', 47.0, 8.2);
        const enraa = intersection('ENRAA', 47.0, 8.4);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            departures: [sid('DEP1', {runways: [{runway: '27', legs: [Leg.CA(270), Leg.DF(depaa)]}], common: [Leg.TF(enraa)]})],
        });
        const unit = await bootUnit({facilities: [kprc, depaa, enraa], efb: true, storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');
        expect(fplIdents(unit)).toEqual(['KPRC', 'DEPAA', 'ENRAA']); // Precondition

        const route = requestRoute(unit);

        expect(route.departureAirport.ident).toBe('KPRC');
        expect(route.departure).toBe('DEP1');
        expect(route.departureRunway.number).toBe('27');
        expect(route.enroute).toEqual([]);
    });

    // Also the sibling of the runway pin below: the same world answers, with the approach typed
    it('sends the STAR by name and transition, with its airport as the destination', async () => {
        const unit = await bootWithStarAndApproach09();
        expect(fplIdents(unit)).toEqual(['ENRAA', 'ENRAA', 'ARRAA', 'FAFAA', 'FAFAA', 'MAPAA', 'KPRC']); // Precondition

        const route = requestRoute(unit);

        expect(route.destinationAirport.ident).toBe('KPRC');
        expect(route.arrival).toBe('ARR1');
        expect(route.arrivalTransition).toBe('ENRAA');
        expect(route.enroute.map(l => l.fixIcao.ident)).toEqual(['ENRAA']);
        expect(route.approach.type).toBe('RNAV');
    });

    // RunwayIdentifier.number is the SDK's runway number string, two digits for 01 to 36 (RunwayUtils.getNumberString),
    // so runway 9 goes out as 09 (#186)
    it('sends runway 09 of an approach as 09 (#186)', async () => {
        const unit = await bootWithStarAndApproach09();

        expect(requestRoute(unit).approach.runway.number).toBe('09');
    });

    // The same number string for the runway of a SID, with the designator letter beside it: runway 03L goes out as
    // number 03, designator L (#186)
    it('sends runway 03L of a SID as 03 and L (#186)', async () => {
        const depaa = intersection('DEPAA', 47.0, 8.2);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            departures: [sid('DEP1', {runways: [{runway: '03L', legs: [Leg.CA(30), Leg.DF(depaa)]}]})],
        });
        const unit = await bootUnit({facilities: [kprc, depaa], efb: true, storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');
        expect(fplIdents(unit)).toEqual(['KPRC', 'DEPAA']); // Precondition

        const route = requestRoute(unit);

        expect(route.departure).toBe('DEP1');
        expect(route.departureRunway.number).toBe('03');
        expect(route.departureRunway.designator).toBe('L');
    });

    // A lettered runway (the north runway, number 37 in the database) goes out as its letters, as the SDK's number
    // string gives it (#186)
    it('sends the north runway of a SID as N (#186)', async () => {
        const depaa = intersection('DEPAA', 47.0, 8.2);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            departures: [sid('DEP1', {runways: [{runway: '37', legs: [Leg.CA(0), Leg.DF(depaa)]}]})],
        });
        const unit = await bootUnit({facilities: [kprc, depaa], efb: true, storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');
        expect(fplIdents(unit)).toEqual(['KPRC', 'DEPAA']); // Precondition

        expect(requestRoute(unit).departureRunway.number).toBe('N');
    });

    // The same for the runway of a STAR: runway 05 goes out as 05 (#186)
    it('sends runway 05 of a STAR as 05 (#186)', async () => {
        const enraa = intersection('ENRAA', 47.0, 8.8);
        const fafaa = intersection('FAFAA', 47.0, 8.4);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            arrivals: [star('ARR1', {common: [Leg.IF(enraa), Leg.TF(fafaa)], runways: [{runway: '05', legs: [Leg.TF(fafaa)]}]})],
        });
        const unit = await bootUnit({facilities: [kprc, enraa, fafaa], efb: true, position: {lat: 47.0, lon: 9.0}, storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');

        const route = requestRoute(unit);

        expect(route.arrival).toBe('ARR1');
        expect(route.destinationRunway.number).toBe('05');
        expect(route.destinationRunway.designator).toBe('');
    });

    // Output.WriteGPSSimVars false is the panel.xml option of a unit that is not the aircraft's GPS (cfg/panel.xml). Such
    // a unit leaves the EFB's route request unanswered; the import of a synced route is not gated
    it('leaves a route request unanswered with WriteGPSSimVars off (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, panelXml: panelXml(NO_GPS_SIMVARS), storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);

        unit.efb!.request();

        expect(unit.efb!.replies).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']); // Not changed either, since nothing was built
    });

    // The Hot Swapping wiki page ("Hot Swapping and Package Detection") and LVars.ts LVAR_DISABLE: a unit disabled for
    // hot swapping has handed its outputs to the GPS that replaced it, so that GPS answers the EFB, not the KLN (#353)
    it('leaves a route request unanswered while the unit is disabled for hot swapping (#353)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        unit.efb!.request();

        expect(unit.efb!.replies).toEqual([]);
    });

    // The gate is the disabled state and nothing wider: the unit answers again once it is put back
    it('answers a route request again after the resume (#353)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        unit.efb!.request();
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        const before = unit.efb!.replies.length;

        unit.efb!.request();

        expect(unit.efb!.replies.length).toBe(before + 1);
        const route = unit.efb!.replies[before].route;
        expect(ICAO.valueToStringV2(route.departureAirport)).toBe(ICAO.valueToStringV2(kaaa.icaoStruct));
        expect(ICAO.valueToStringV2(route.destinationAirport)).toBe(ICAO.valueToStringV2(kbbb.icaoStruct));
    });
});
