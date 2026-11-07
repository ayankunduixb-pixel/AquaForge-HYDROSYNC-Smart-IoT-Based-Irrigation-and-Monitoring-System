Copy sketch.ino, diagram.json, and libraries.txt into the matching Wokwi project tabs.
Library package name: DHT sensor library for ESPx.
Code header remains #include <DHTesp.h> — do not add DHTesp as a separate libraries.txt entry.

The supplied diagram starts the AUTO/MANUAL switch in AUTO (right) and the manual request switch OFF (left). Switch bounce is disabled in the diagram and debounced in firmware. Tank lockout engages below 15% and recovers at 20%. Enable network access in Wokwi for MQTT.
