export type TimeZoneInfo = {
    utcOffset: number;
    dstActive: boolean;
}

export class TimezoneService {

    public static async getTimezoneInfo(datum: number, latitude: number, longitude: number): Promise<TimeZoneInfo> {
        return await Coherent.call('GET_TIMEZONE_INFO', datum, latitude, longitude);
    }
}