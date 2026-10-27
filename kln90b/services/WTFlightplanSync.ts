import {Flightplan, FlightplanEvents, KLNFixType} from "../data/flightplan/Flightplan";
import {
    EventBus,
    FacilityClient,
    FlightPathAirplaneSpeedMode,
    FlightPathAirplaneWindMode,
    FlightPathCalculator,
    FlightPlan,
    FlightPlanner,
    FlightPlanSegmentType,
    LegType,
} from "@microsoft/msfs-sdk";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {ActiveWaypoint, ActiveWaypointChangedEvents} from "../data/flightplan/ActiveWaypoint";
import {Hardware} from "../Hardware";


const FLIGHTPLANNER_ID = "kln90b";

const DTO_PLAN_INDEX = 1;
export class WTFlightplanSync {
    private readonly flightplanner: FlightPlanner;

    constructor(bus: EventBus, facilityLoader: FacilityClient, private readonly planeSettings: KLN90PlaneSettings, private readonly activeWaypoint: ActiveWaypoint, private readonly hardware: Hardware) {
        bus.getSubscriber<FlightplanEvents>().on("flightplanChanged").handle(this.flightplanChanged.bind(this));
        bus.getSubscriber<ActiveWaypointChangedEvents>().on("activeWaypointChanged").handle(this.activeIdxChanged.bind(this));

        const calculator = new FlightPathCalculator(
            facilityLoader,
            {
                id: FLIGHTPLANNER_ID,
                initSyncRole: 'primary',
                defaultClimbRate: 300,
                defaultSpeed: 50,
                bankAngle: [[10, 60], [40, 300]],
                holdBankAngle: null,
                courseReversalBankAngle: null,
                turnAnticipationBankAngle: [[10, 60], [15, 100]],
                maxBankAngle: 25,
                airplaneSpeedMode: FlightPathAirplaneSpeedMode.GroundSpeed,
                airplaneWindMode: FlightPathAirplaneWindMode.None,
            },
            bus,
        );

        //Real unit: fictional as a container. The SDK planner "kln90b" stands for the flight plan the unit sends on RS-232
        //and ARINC 429 (setPlanLegs); its plan indexes, segments, leg types and path calculator have no counterpart
        this.flightplanner = FlightPlanner.getPlanner(FLIGHTPLANNER_ID, bus, {calculator: calculator});
        this.flightplanner.createFlightPlan(0);
        this.flightplanner.setActivePlanIndex(0);
    }

    private flightplanChanged(klnPlan: Flightplan) {
        if (klnPlan.idx !== 0 || !this.planeSettings.output.writeGPSSimVars) {
            return;
        }

        this.syncToWTFlightplan(klnPlan, this.activeWaypoint.getActiveFplIdx());
    }

    /**
     * Mirrors FPL 0 right away. L:KLN90B_WriteGpsSimvars switches the option on at runtime, and the planner would stay
     * empty or stale until the next change otherwise. SimVarSync also calls it when the unit is put back after hot
     * swapping (#398).
     */
    public sync() {
        this.syncToWTFlightplan(this.activeWaypoint.fpl0, this.activeWaypoint.getActiveFplIdx());
    }

    private activeIdxChanged(activeIdx: number) {
        if (!this.planeSettings.output.writeGPSSimVars) {
            return;
        }

        this.syncToWTFlightplan(this.activeWaypoint.fpl0, activeIdx);
    }

    private syncToWTFlightplan(klnPlan: Flightplan, activeIdx: number) {
        if (this.hardware.isDisabled) {
            //#398: a unit disabled for hot swapping writes no outputs, whatever asks for the sync. SimVarSync syncs once
            //when it is put back
            return;
        }
        this.writeFpl0(klnPlan, activeIdx);
        this.writeDtoPlan();

        console.log("wtPlan", this.flightplanner);
    }

    private writeFpl0(klnPlan: Flightplan, activeIdx: number) {
        const wtPlan = this.flightplanner.getFlightPlan(0);
        const batchID = wtPlan.openBatch("KLN_sync");

        this.emptyFlightplan(wtPlan);
        this.setPlanLegs(wtPlan, klnPlan, activeIdx);
        wtPlan.closeBatch(batchID);
    }

    private writeDtoPlan() {
        //DTO is done on flightplan 1 like the Garmins
        //Since the KLN always keeps the entire flightplan, we do all DTOs here, not just random DTOs
        //Real unit: plan 1 is fictional. A direct-to is sent as
        //- ARINC 429 transmitter, label 275 bit 13 = 1 direct to (GAMA 11 page 19), with the from and to records of
        //  label 075 (setPlanLegs). In GAMA's example protocol a direct-to sends the header labels 074 and 075 again
        //  (GAMA 11 page 3-3)
        //- RS-232 OUT, item t GPS discretes, character d = D (Installation manual A-6)
        //The from position of a direct-to is not a flight plan waypoint, so neither output carries it as one
        if (this.activeWaypoint.isDctNavigation()) {
            const dtoPlan = this.flightplanner.createFlightPlan(DTO_PLAN_INDEX);
            const batchID = dtoPlan.openBatch("KLN_sync");
            this.emptyFlightplan(dtoPlan);
            dtoPlan.addSegment(0, FlightPlanSegmentType.RandomDirectTo);
            const from = this.activeWaypoint.getFromWpt()!;

            const fromLeg = FlightPlan.createLeg({
                type: LegType.IF,
                lat: from.lat,
                lon: from.lon,
            });
            dtoPlan.addLeg(0, fromLeg);

            const to = this.activeWaypoint.getActiveWpt()!;

            const toLeg = FlightPlan.createLeg({
                type: LegType.DF,
                fixIcaoStruct: to.icaoStruct,
                fixIcao: to.icao,
                lat: to.lat,
                lon: to.lon,
            });
            dtoPlan.addLeg(0, toLeg);
            dtoPlan.setLateralLeg(1);
            dtoPlan.setDirectToData(1);
            dtoPlan.closeBatch(batchID);
            this.flightplanner.setActivePlanIndex(DTO_PLAN_INDEX);
        } else {
            this.flightplanner.deleteFlightPlan(DTO_PLAN_INDEX);
            this.flightplanner.setActivePlanIndex(0);
        }
    }

    private emptyFlightplan(wtPlan: FlightPlan) {
        if (wtPlan.length == 0) {
            return;
        }

        wtPlan.removeSegment(0);
    }

    private setPlanLegs(wtPlan: FlightPlan, klnPlan: Flightplan, activeIdx: number) {
        wtPlan.addSegment(0, FlightPlanSegmentType.Enroute);

        let currentIdx = 0;
        let idxForWt = activeIdx;

        for (const klnLeg of klnPlan.getLegs()) {
            //The real KLN only transmits waypoint number, active waypoint, identifier, lat, lon and magvar
            //Real unit: one waypoint of the active flight plan (FPL 0), either
            //- RS-232 OUT, item w flight plan data, item designator w01 to w99 and at most 32 waypoints, the whole plan
            //  every 2 s: byte 1 sequence (bits 0-4 waypoint number, bit 5 active, bit 6 last), bytes 2-6 the identifier
            //  in ASCII, bytes 7-9 latitude and 10-13 longitude as packed degrees, minutes and hundredths of minutes,
            //  bytes 14-15 the waypoint's magnetic variation in 1/16 deg, two's complement, East positive (Installation
            //  manual A-8, A-9)
            //- ARINC 429 transmitter, one record per waypoint, after the header labels 074 (bits
            //  9-15 the number of records) and 075 (from/to record numbers). A record is label 303 (bits 9-12 the number
            //  of words, 13-15 the waypoint type, 17-23 the record number in flight plan order), labels 304/305 the
            //  identifier in 7-bit characters, labels 306/307 latitude and longitude (BNR bits 9-28, 180/1048576 deg
            //  LSB, bit 29 = 1 South or West), label 300 for a navaid (bits 17-24 its declination in whole degrees), and
            //  label 113 last, the checksum of the record (GAMA 11 pages 9 to 11, 21 to 23, 3-3 to 3-5). GAMA's example
            //  protocol also sends one record every 0.1 s and no waypoints before the from waypoint (GAMA 11 pages 3-3,
            //  3-4), but other systems may do it differently and Honeywell does not say what the KLN 90B does. The
            //  RS-232 output sends the whole plan instead (Installation manual A-8)
            //The leg type DF is fictional; neither output carries a leg type
            const leg = FlightPlan.createLeg({
                type: LegType.DF,
                fixIcaoStruct: klnLeg.wpt.icaoStruct,
                fixIcao: klnLeg.wpt.icao,
                lat: klnLeg.wpt.lat,
                lon: klnLeg.wpt.lon,
            });
            wtPlan.addLeg(0, leg);
            if (klnLeg.fixType === KLNFixType.MAP && currentIdx >= activeIdx) {
                //Real unit: the active waypoint, either RS-232 OUT item w, bit 5 of the sequence byte (Installation
                //manual A-8), or ARINC 429 label 075, the TO record number in BCD in bits 13-16 (tens) and 21-24 (units)
                //and the FROM in bits 17-20 and 25-28 (GAMA 11 page 10)
                wtPlan.setLateralLeg(idxForWt);
                wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);
                return; //Install manual: We do not return data after a fence
            }
            if (klnLeg.arcData) {
                if (currentIdx >= activeIdx) {
                    wtPlan.setLateralLeg(idxForWt);
                    wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);
                    return; //Install manual: We do not return data after an arc
                } else {
                    //Everything before the arc must be deleted again, we only transmit everything after the arc
                    idxForWt -= wtPlan.length;
                    wtPlan.removeSegment(0);
                    wtPlan.addSegment(0, FlightPlanSegmentType.Enroute);
                }

            }
            currentIdx++;
        }

        wtPlan.setLateralLeg(idxForWt);
        wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);

    }

}