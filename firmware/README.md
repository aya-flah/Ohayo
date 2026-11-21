# Sonae Node firmware (owner: P3)

One ESP32 sketch, [`src/main.cpp`](src/main.cpp), runs both in the Wokwi simulator and on the real board. It:

- reads the tank level (HC-SR04, median of 5), the flow (YF-S401 pulses), solar power (INA219) and whether the 12 V "STEG" line is alive;
- runs the 48-hour plan the server pushes, using its own clock (NTP online, DS1307/DS3231 offline), and falls back to on-board pump-ahead rules with no plan;
- enforces safety rules no command can override: stop at 95% full, stop after 15 s of pumping with no flow, maximum run time, never drain below the reserve;
- publishes signed telemetry every 5 s on `sonae/gda-kairouan-01/N01/telemetry` (HMAC-SHA256 over the JSON, plus a hash chain via `prev`). The web app's **Twin → Live from the node** shows it.

## Run it in Wokwi (no hardware, 5 minutes)

1. Open [wokwi.com](https://wokwi.com), start a new **ESP32** project.
2. Replace `sketch.ino` with the contents of `src/main.cpp`, and uncomment `#define WOKWI 1` at the top.
3. Replace `diagram.json` with [`wokwi/diagram.json`](wokwi/diagram.json).
4. Add the libraries listed in [`wokwi/libraries.txt`](wokwi/libraries.txt) (Library Manager tab).
5. Press play. Drag the HC-SR04 distance to change the tank level, turn the potentiometers for sun and flow, flip the slide switch to unplug the "grid", press the red button to fake a STEG cut.
6. In the Sonae website, open **Twin** and choose **Live from the node** (set `VITE_MQTT_WS_URL` in `apps/web/.env.local`).

With VS Code: install the PlatformIO and Wokwi extensions, run `pio run -e wokwi`, then open `wokwi/diagram.json`.

## Flash the real board

`pio run -e esp32dev -t upload`, then `pio device monitor`. Wiring, parts and the test procedure are in section 10 of the plan doc. Put your Wi-Fi and a real device key in a local copy of the settings; never commit them.

## Not verified yet

The firmware has not been compiled on this machine (no PlatformIO here). First job for P3: compile it in Wokwi and fix any library-version warnings.
