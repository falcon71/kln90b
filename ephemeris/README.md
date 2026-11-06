# Ephemeris sources

The build generates the unit's `gps_ephemeris.json` from the two files in this folder
(`tools/ephemeris/ephemeris.mts`). Nothing else here is read.

- `brdc1820.22n` is the daily GPS broadcast ephemeris (RINEX 2 navigation file) of 2022-07-01, day 182, from the
  CDDIS archive. It was obtained through the MSFS Avionics Framework repository. We acknowledge CDDIS (NASA's
  Crustal Dynamics Data Information System) as its source. New files are in the CDDIS daily GNSS data archive,
  https://cddis.nasa.gov/archive/gnss/data/daily/ (broadcast ephemeris `brdcDDD0.YYn` files).
- `igs_satellite_metadata.snx` is the IGS satellite metadata file as published by the International GNSS Service
  (IGS) and its contributing organizations. It was prepared by DLR (Steigenberger & Montenbruck, IGS Satellite
  Metadata File Description 1.10, doi:10.57677/metadata-sinex) and is used under the IGS Data and Product
  Disclaimer and Terms of Use of 5 August 2020. It gives the satellite block (GPS-IIA, GPS-IIR, ...) of the
  satellite that carried each PRN at the epoch of the ephemeris. This copy is release 2441, downloaded on
  2026-11-06 from https://files.igs.org/pub/station/general/igs_satellite_metadata.snx.

Both files are committed byte for byte (`.gitattributes` turns line-ending conversion off for them).

## Updating

Replace the RINEX file with a `brdcDDD0.YYn` file. Exactly one such file may be in this folder, or the build
fails. Fetch a current SINEX file when satellites were launched since the last copy; otherwise the build fails
naming the PRN whose satellite is missing. The next build regenerates the JSON.
