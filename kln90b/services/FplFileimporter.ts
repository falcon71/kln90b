import {Flightplan} from "../data/flightplan/Flightplan";
import {Flightplanloader} from "./Flightplanloader";

export class FplFileimporter extends Flightplanloader {


    public async importFpl(): Promise<Flightplan> {
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

    private async loadFromXml(xml: Document): Promise<Flightplan> {
        const flightPlan = xml.getElementsByTagName("FlightPlan.FlightPlan")[0];

        // Get all ATCWaypoint nodes
        const waypointTags = flightPlan.getElementsByTagName("ATCWaypoint");

        const icaos: string[] = [];

        // Iterate through each ATCWaypoint node
        for (let i = 0; i < waypointTags.length; i++) {
            const waypoint = waypointTags[i];
            try {
                let type = "";
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
                    default:
                        type = "X";
                        break;
                }
                const regionTags = waypoint.getElementsByTagName("ICAORegion");
                const region = regionTags.length > 0 ? regionTags[0].textContent! : "  ";

                const airportTags = waypoint.getElementsByTagName("ICAOAirport");
                const airport = airportTags.length > 0 ? airportTags[0].textContent! : "    ";

                const ident = waypoint.getElementsByTagName("ICAOIdent")[0].textContent!.padEnd(5, " ");

                const icao = type + region + airport + ident;
                console.log("icao", icao);
                icaos.push(icao);
            } catch (e) {
                console.error("Error reading ATCWaypoint", waypoint)
            }

        }

        return this.loadIcaos(icaos);

    }

}