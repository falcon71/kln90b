# KLN 90B

This is a simulation of the Bendix/King KLN 90B GPS for the Microsoft Flight Simulator.

## Users
Download the current version on releases page. This package only contains the GPS device. To use the KLN 90B, you will need an aircraft that incorporates this project.

Documentation for the real device:

https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08774-0000-KLN-90B-Abbreviated-Operations-Manual.pdf

https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf

## FAQ
### I press the power button and the device stays off

Make sure your aircraft is powered. It will also take a few seconds for the screen to warm up, before the welcome page will be shown.

### It takes a long time until a GPS signal is acquired

The KLN 90B remembers your last position. If this differs from you actual position, it may take up the 12 minutes until a GPS signal is acquired. In this case, enter your position on the SET 1 page. 

## Aircraft developers

Include the following entry in your panel.cfg:
```
[VcockpitXX]
size_mm = 860,388
pixel_size = 860,388
texture=$KLN90B_Screen
htmlgauge00=NavSystems/GPS/KLN90B/KLN90B.html, 0, 0, 860,388
```

It is also advisable to use a panel.xml for configuration. An example panel.xml is included in the cfg folder.

Aircraft should only interact with the KLN 90B via H Events. The events are listed in HEvents.ts. A few LVARs are available for animations. 

Please kep in mind, that the KLN 90B is currently in beta and a few details are subject to change until the first release.

You are free to include the KLN 90B into your aircraft. If you do, write me a message. so I can include it in the list of aircraft that use the KLN 90B. If your aircraft is a payware aircraft, I would be happy to receive a copy.

## Contributors

Feel free to open issues or send pull requests.

The entry class is KLN90B.tsx. Other interesting classes are MainPage.tst and PageTreeController.tsx.

Numbers in the comments in the format 1-12 reference a page in the manual that contains further information and reference:
https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf

## License
This project is licensed under The GNU General Public License v3.0.