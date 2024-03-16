# KLN 90B

This is a simulation of the Bendix/King KLN 90B GPS for the Microsoft Flight Simulator.

## Users
Download the current version on the [releases page](https://github.com/falcon71/kln90b/releases). This package only contains the GPS device. To use the KLN 90B, you will need an [aircraft that incorporates this project](https://github.com/falcon71/kln90b/wiki/Aircraft-using-the-KLN-90B).

Documentation for the real device:

https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08774-0000-KLN-90B-Abbreviated-Operations-Manual.pdf

https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf

### Keyboard Mode

When a cursor is active, left click on the CRSR indication to switch to keyboard mode. While KYBD is flashing, the
simulator will disable all inputs, including joystick inputs. To leave keyboard mode, right click anywhere on the
screen.

Mapping:

* Home, End: Outer knob
* Page up, Page down: Inner knob
* Enter: ENT
* Delete: CLR
* A-Z, 0-9 and backspace work in certain text and number fields

## FAQ

### I press the power button and the device stays off

Make sure your aircraft is powered. It will also take a few seconds for the screen to warm up, before the welcome page
will be shown. Also check that the aircraft has electricity and no circuit brakers are pulled.

### It takes a long time until a GPS signal is acquired

If you have not used the KLN in the past three months (or ever), it will need to search the entire sky for valid GPS
satelites . Afterwards, this catalogue will be saved, so the next time will be faster.
The KLN 90B also remembers your last position. If this differs from you actual position, GPS acquisition will take
longer.
In this case, enter your position on the SET 1 page.

Alternativly, you can set the GPS acquisition time to fast on the SET 10 page. GPS acquisition will then take less than
30 seconds.

## Aircraft developers

Include the following entry in your panel.cfg:

```
[VcockpitXX]
size_mm = 860,388
pixel_size = 860,388
texture=$KLN90B_Screen
htmlgauge00=NavSystems/GPS/KLN90B/KLN90B.html, 0, 0, 860,388
```

It is also advisable to use a [panel.xml](https://github.com/falcon71/kln90b/wiki/panel.xml-customization) for
configuration.

Aircraft should only interact with the KLN 90B via H Events. The events are listed
in [HEvents.ts](https://github.com/falcon71/kln90b/blob/main/kln90b/HEvents.ts). A
few [LVars](https://github.com/falcon71/kln90b/blob/main/kln90b/LVars.ts) are available for animations.

Please kep in mind, that the KLN 90B is currently in beta and a few details are subject to change until the first
release.

You are free to include the KLN 90B into your aircraft. If you do, write me a message. so I can include it in the list of aircraft that use the KLN 90B. If your aircraft is a payware aircraft, I would be happy to receive a copy.

## Contributors

Feel free to open issues or send pull requests.

The entry class is [KLN90B.tsx](https://github.com/falcon71/kln90b/blob/main/kln90b/KLN90B.tsx). Other interesting
classes are [MainPage.tsx](https://github.com/falcon71/kln90b/blob/main/kln90b/pages/MainPage.tsx)
and [PageTreeController.tsx](https://github.com/falcon71/kln90b/blob/main/kln90b/pages/PageTreeController.ts).

Numbers in the comments in the format 1-12 reference a page in
the [manual](https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf)
that contains further information and reference.

## License

This project is licensed under The GNU Lesser General Public License v3.0.