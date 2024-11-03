import {FlightPlan} from "../data/flightplan/FlightPlan";
import {Flightplanloader} from "./Flightplanloader";
import {getUniqueIdent} from "../data/navdata/UniqueIdentGenerator";
import {UserFacility, UserFacilityType} from "@microsoft/msfs-sdk";
import {buildIcao, buildIcaoWithAirport, TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";
import {StatusLineMessageEvents} from "../controls/StatusLine";

export class FplFileimporter extends Flightplanloader {


    public async importFpl(): Promise<FlightPlan> {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.onreadystatechange = () => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    if (request.status === 200 && request.responseXML !== null) {
                        try {
                            resolve(this.loadFromXml(request.responseXML));
                        } catch (e) {
                            console.error("Error importing fpl file", e);
                            reject(e);
                        }
                    } else {
                        reject(`Could not load fpl file: ${request.status}`);
                    }
                }
            };
            request.open('GET', "/VFS/flightplan/kln/kln.pln");
            request.send();
        });
    }

    public async klnPlnFileExists(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.onreadystatechange = () => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    if (request.status === 200 && request.responseXML !== null) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            };
            request.open('GET', "/VFS/flightplan/kln/kln.pln");
            request.send();
        });
    }

    private async loadFromXml(xml: Document): Promise<FlightPlan> {
        const flightPlan = xml.getElementsByTagName("FlightPlan.FlightPlan")[0];

        // Get all ATCWaypoint nodes
        const waypointTags = flightPlan.getElementsByTagName("ATCWaypoint");

        const icaos: string[] = [];

        // Iterate through each ATCWaypoint node
        for (let i = 0; i < waypointTags.length; i++) {
            const waypoint = waypointTags[i];
            try {
                //It is important, that this code is synchronized, so the waypoint gets added to the facility, before the next getUniqueIdent is called
                const icao = await this.convertLeg(waypoint);
                console.log("icao", icao);
                icaos.push(icao);

            } catch (e) {
                console.error("Error reading ATCWaypoint", waypoint)
            }

        }

        return this.loadIcaos(icaos);

    }

    private async convertLeg(waypoint: Element): Promise<string> {
        let type: string;
        switch (waypoint.getElementsByTagName("ATCWaypointType")[0].textContent) {
            case "Airport":
                type = "A";
                break;
            case "Intersection":
                type = "W";
                break;
            case "VOR":
                type = "V";
                break;
            case "NDB":
                type = "N";
                break;
            case "User":
                type = "U";
                break;
            default:
                type = "X";
                break;
        }
        const regionTags = waypoint.getElementsByTagName("ICAORegion");
        const region = regionTags.length > 0 ? regionTags[0].textContent! : "  ";

        const airportTags = waypoint.getElementsByTagName("ICAOAirport");
        const airport = airportTags.length > 0 ? airportTags[0].textContent! : "    ";

        const ident = waypoint.getElementsByTagName("ICAOIdent")[0].textContent!.toUpperCase();

        if (type === "U") {
            //Will be added as a temporary user waypoint
            const newIdent = await getUniqueIdent(ident, this.facilityLoader);

            if (newIdent === null) {
                return `       ${ident}`; //This waypoint will not be found and cause a WAYPOINT DELETED message
            }

            const worldPosition = waypoint.getElementsByTagName("WorldPosition")[0].textContent!.split(',');

            const facility: UserFacility = {
                icao: buildIcao('U', TEMPORARY_WAYPOINT, newIdent),
                name: "",
                lat: this.parseLatitude(worldPosition[0]),
                lon: this.parseLongitude(worldPosition[1]),
                region: TEMPORARY_WAYPOINT,
                city: "",
                magvar: 0,
                isTemporary: false, //irrelevant, because this flag is not persisted
                userFacilityType: UserFacilityType.LAT_LONG,
            };
            console.log("Adding temporary user waypoint", facility);

            try {
                this.facilityLoader.getFacilityRepo().add(facility);
                return facility.icao;
            } catch (e) {
                this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
                console.error(e);
                return `       ${ident}`; //This waypoint will not be found and cause a WAYPOINT DELETED message
            }

        } else {
            return buildIcaoWithAirport(type as any, region, airport, ident);
        }
    }

    private parseLatitude(latitudeString: string): number {
        const regex = /([NS])(\d{1,2})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)/;
        const match = latitudeString.match(regex);

        if (!match) {
            throw new Error("Invalid latitude format");
        }

        const hemisphere = match[1];
        const degrees = parseInt(match[2], 10);
        const minutes = parseInt(match[3], 10);
        const seconds = parseFloat(match[4]);

        let latitude = degrees + (minutes / 60) + (seconds / 3600);

        if (hemisphere === 'S') {
            latitude = -latitude;
        }

        return latitude;
    }

    private parseLongitude(longitudeString: string): number {
        const regex = /([EW])(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)/;
        const match = longitudeString.match(regex);

        if (!match) {
            throw new Error("Invalid longitude format");
        }

        const hemisphere = match[1];
        const degrees = parseInt(match[2], 10);
        const minutes = parseInt(match[3], 10);
        const seconds = parseFloat(match[4]);

        let longitude = degrees + (minutes / 60) + (seconds / 3600);

        if (hemisphere === 'W') {
            longitude = -longitude;
        }

        return longitude;
    }
}