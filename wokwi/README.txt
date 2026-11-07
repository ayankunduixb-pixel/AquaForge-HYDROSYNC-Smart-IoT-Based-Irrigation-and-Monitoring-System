Copy firmware/AquaForge_HYDROSYNC_Stage4.ino into the Wokwi project's sketch.ino. Copy this folder's diagram.json and libraries.txt into the Wokwi diagram.json and libraries.txt tabs. Source project: https://wokwi.com/projects/479928426260819969

The supplied diagram starts the AUTO/MANUAL switch in AUTO (right) and the manual request switch OFF (left). Switch bounce is disabled in the diagram and debounced in firmware. Tank lockout engages below 15% and recovers at 20%. Enable network access in Wokwi for MQTT.
