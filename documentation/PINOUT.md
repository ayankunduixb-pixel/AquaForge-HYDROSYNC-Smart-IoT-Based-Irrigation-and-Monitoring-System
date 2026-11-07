# HYDROSYNC pinout

| Component | ESP32 GPIO |
|---|---:|
| Soil potentiometer SIG | 34 |
| Tank potentiometer SIG | 35 |
| DHT22 SDA | 15 |
| Pump LED | 25 |
| Low-tank LED | 26 |
| AUTO/MANUAL switch center | 27 |
| Manual request switch center | 14 |
| Relay IN | 22 |
| SD CS | 5 |
| SD SCK | 18 |
| SD DO/MISO | 19 |
| SD DI/MOSI | 23 |

Wokwi diagram uses board pin identifiers D34, D35, D15, D25, etc.
Relay IN remains on GPIO22; SD MOSI remains on GPIO23.

## Switch wiring and defaults

Each slide switch connects its center pin to GPIO, pin 1 to GND and pin 3 to
3V3:

- **AUTO/MANUAL (GPIO27):** right/`1` = 3V3 = AUTO; left/`""` = GND = MANUAL.
  The supplied diagram boots in AUTO.
- **Manual request (GPIO14):** right/`1` = 3V3 = request ON; left/`""` = GND =
  OFF. The supplied diagram boots with the request off.

## Control thresholds

- Soil pump ON at 30% or lower; pump OFF at 45% or higher.
- Tank lockout below 15%; recovery at 20% (hysteresis).
- `RELAY_ACTIVE_LOW = false` matches the Wokwi relay module default. Change it
  only if the physical relay module is active-low.
