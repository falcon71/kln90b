import {Seconds} from "./Units";

export class Timezone {

    constructor(public code: string, public offset: number, public name: string) {
    }
}

export const TIMEZONES = [
    new Timezone("UTC", 0, "CORD UNIV/Z "),
    new Timezone("GST", -3, "GREENL STD "),
    new Timezone("GDT", -2, "GREENL DAY "),
    new Timezone("ATS", -4, "ATLANT STD "),
    new Timezone("ATD", -3, "ATLANT DAY "),
    new Timezone("EST", -5, "EASTERN STD"),
    new Timezone("EDT", -4, "EASTERN DAY"),
    new Timezone("CST", -6, "CENTRAL STD"),
    new Timezone("CDT", -5, "CENTRAL DAY"),
    new Timezone("MST", -7, "MOUNT STD  "),
    new Timezone("MDT", -6, "MOUNT DAY  "),
    new Timezone("PST", -8, "PACIFIC STD"),
    new Timezone("PDT", -7, "PACIFIC DAY"),
    new Timezone("AKS", -9, "ALASKA STD "),
    new Timezone("AKD", -8, "ALASKA DAY "),
    new Timezone("HAS", -10, "HAWAII STD "),
    new Timezone("HAD", -9, "HAWAII DAY "),
    new Timezone("SST", -11, "SAMOA STD  "),
    new Timezone("SDT", -10, "SAMOA DAY  "),

];

export const UTC = TIMEZONES[0];

const MILLISECOND = 1;
const SECOND = MILLISECOND * 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const YEAR = DAY * 350;

export class TimeStamp {


    private constructor(private date: Date, public readonly tz: Timezone) {
    }

    public static create(timestamp: number, tz: Timezone = UTC): TimeStamp {
        return new TimeStamp(new Date(timestamp), tz)
    }

    public static createDate(year: number, month: number, date: number, tz: Timezone = UTC): TimeStamp {
        return new TimeStamp(new Date(Date.UTC(year, month, date)), tz)
    }

    public static createTime(hours: number, minutes: number, tz: Timezone = UTC): TimeStamp {
        return new TimeStamp(new Date(Date.UTC(0, 0, 1, hours, minutes)), tz)
    }

    public getYear(): number {
        return this.date.getUTCFullYear();
    }

    public getMonth(): number {
        return this.date.getUTCMonth();
    }

    public getDate(): number {
        return this.date.getUTCDate();
    }

    public getHours(): number {
        return this.date.getUTCHours();
    }

    public getMinutes(): number {
        return this.date.getUTCMinutes();
    }

    public getSeconds(): number {
        return this.date.getUTCSeconds();
    }

    public getMilliseconds(): number {
        return this.date.getUTCMilliseconds();
    }

    public atTimezone(tz: Timezone): TimeStamp {
        return new TimeStamp(new Date(this.getTimestamp() - this.tz.offset * HOUR + tz.offset * HOUR), tz)
    }

    public getTimestamp(): number {
        return this.date.getTime();
    }

    public setTimestamp(timestamp: number): void {
        this.date.setTime(timestamp);
    }

    public withDate(year: number, month: number, date: number): TimeStamp {
        const datePortion = Date.UTC(year, month, date);
        const timePortion = this.getTimestamp() % DAY;

        return new TimeStamp(new Date(datePortion + timePortion), this.tz)
    }

    public addSeconds(seconds: Seconds): TimeStamp {
        return new TimeStamp(new Date(this.getTimestamp() + seconds * SECOND), this.tz);
    }

    public withTime(hours: number, minutes: number): TimeStamp {
        const datePortion = this.getTimestamp() - (this.getTimestamp() % DAY);
        const timePortion = hours * HOUR + minutes * MINUTE + this.getSeconds() * SECOND + this.getMilliseconds();

        return new TimeStamp(new Date(datePortion + timePortion), this.tz)
    }
}

//5-15 Maximumum Date ist 2087
export function shortYearToLongYear(year: number) {
    return year + (year <= 87 ? 2000 : 1900);
}