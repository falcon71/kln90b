import {Facility, FixTypeFlags, ICAO, ReadonlyFlightPlanRoute} from '@microsoft/msfs-sdk';
import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, sid, star, withProcedures} from '../../harness/navdata/procedures';
import {approachWorld} from '../../harness/fixtures';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

const fpl0Idents = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

/** The SDK logs the handler error with console.error; keep it out of the test output */
function muteConsoleError(): void {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Registered before the boot, so it runs after the teardown has put the spy back
    onTestFinished(() => spy.mockRestore());
}

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
        expect(fpl0Idents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        const route = unit.efb!.replies[0].route;
        expect(route.departureAirport.ident).toBe('KAAA');
        expect(route.destinationAirport.ident).toBe('KBBB');
        expect(route.enroute.map(leg => [leg.lat, leg.lon])).toEqual([[47.5, 8.5]]);
    });

    // toEfbRoute() takes the airports off the array getLegs() returns, which is the internal leg array of FPL 0
    it.fails('a route request leaves FPL 0 unchanged (#91)', async () => {
        const unit = await bootWithRoute();

        unit.efb!.request();

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);
    });

    // The preconditions of the two pins below, which an it.fails would hide if they broke
    it('starts from an empty FPL 0, and from one that holds only an airport after a synced route', async () => {
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        expect(fpl0Idents(unit)).toEqual([]);

        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA']);
    });

    // toEfbRoute() reads legs[0] and then the last leg without checking that a leg is left. The SDK's SubEvent catches the
    // TypeError and logs it with console.error, so nothing is thrown at the EFB and it never gets an answer
    it.fails('a route request with an empty FPL 0 is answered with an empty route (#91)', async () => {
        muteConsoleError();
        const unit = await bootUnit({efb: true});
        await settle(unit);
        expect(fpl0Idents(unit)).toEqual([]);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        expect(ICAO.isValueEmpty(unit.efb!.replies[0].route.departureAirport)).toBe(true);
        expect(ICAO.isValueEmpty(unit.efb!.replies[0].route.destinationAirport)).toBe(true);
    });

    it.fails('a route request with only an airport in FPL 0 is answered (#91)', async () => {
        muteConsoleError();
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(fpl0Idents(unit)).toEqual(['KAAA']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
    });
});

/** Asks for the route and returns the one answer; the request changes FPL 0 (#91), so read the plan before */
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
    const unit = await bootUnit({facilities: [kprc, enraa, arraa, fafaa, mapaa], efb: true, position: {lat: 47.0, lon: 9.0}, storage: savedFlightplan(0, [enraa, kprc])});
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
        const abc = vor('ABC', 47.2, 8.1);
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], efb: true, storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);

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
        expect(fpl0Idents(unit)).toEqual(['KAAA', 'FARM', 'KBBB']); // Precondition: restored

        const route = requestRoute(unit);

        expect(route.enroute.map(l => [l.hasLatLon, ICAO.valueToStringV2(l.fixIcao)])).toEqual([[true, 'UXX        FARM    ']]);
        expect(route.enroute[0].lat).toBeCloseTo(47.2, 6);
        expect(route.enroute[0].lon).toBeCloseTo(8.1, 6);
    });

    it('sends the approach by type, runway and transition, with its airport as the destination', async () => {
        const w = approachWorld();
        const unit = await bootUnit({facilities: w.facilities, efb: true, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(fpl0Idents(unit)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']); // Precondition

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
        expect(fpl0Idents(unit)).toEqual(['KPRC', 'DEPAA', 'ENRAA']); // Precondition

        const route = requestRoute(unit);

        expect(route.departureAirport.ident).toBe('KPRC');
        expect(route.departure).toBe('DEP1');
        expect(route.departureRunway.number).toBe('27');
        expect(route.enroute).toEqual([]);
    });

    // Also the sibling of the runway pin below: the same world answers, with the approach typed
    it('sends the STAR by name and transition, with its airport as the destination', async () => {
        const unit = await bootWithStarAndApproach09();
        expect(fpl0Idents(unit)).toEqual(['ENRAA', 'ENRAA', 'ARRAA', 'FAFAA', 'FAFAA', 'MAPAA', 'KPRC']); // Precondition

        const route = requestRoute(unit);

        expect(route.destinationAirport.ident).toBe('KPRC');
        expect(route.arrival).toBe('ARR1');
        expect(route.arrivalTransition).toBe('ENRAA');
        expect(route.enroute.map(l => l.fixIcao.ident)).toEqual(['ENRAA']);
        expect(route.approach.type).toBe('RNAV');
    });

    // RunwayIdentifier.number is the SDK's runway number string, two digits for 01 to 36 (RunwayUtils.getNumberString).
    // KlnEfbSaver writes runwayNumber.toString(), which gives 9 for runway 09
    it.fails('sends runway 09 of an approach as 09 (#186)', async () => {
        const unit = await bootWithStarAndApproach09();

        expect(requestRoute(unit).approach.runway.number).toBe('09');
    });

    // Output.WriteGPSSimVars false is the panel.xml option of a unit that is not the aircraft's GPS (cfg/panel.xml). Such
    // a unit leaves the EFB's route request unanswered; the import of a synced route is not gated
    it('leaves a route request unanswered with WriteGPSSimVars off (characterization)', async () => {
        const panelXml = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><WriteGPSSimVars>false</WriteGPSSimVars></Output></Instrument></PlaneHTMLConfig>';
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, panelXml, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);

        unit.efb!.request();

        expect(unit.efb!.replies).toEqual([]);
        expect(fpl0Idents(unit)).toEqual(['KAAA', 'KBBB']); // Not changed either, since nothing was built (#91)
    });
});
