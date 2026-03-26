# 4WD Visual Car Based on Mbed and Raspberry Pi - Client Module

## Project Overview

`bluetooth_controller` is the mobile-side Bluetooth control module of the 4WD visual car system, implemented as a WeChat Mini Program.

Its main responsibilities include:

- Scanning for and connecting to the Bluetooth serial module
- Sending control commands to the mbed main controller
- Providing both button mode and joystick mode for chassis control
- Controlling the gimbal and camera features
- Receiving the Raspberry Pi video stream via WebSocket
- Displaying system send/receive logs

For complete information about the whole project, see the [project homepage](https://github.com/MEshooter/mbed_mecanum_car).

<p align="center">
   <img alt="Controller overview" src="https://github.com/user-attachments/assets/23afcac5-2a9b-4c4c-bc2e-b935bedf1ce1" width="600"/>
</p>

## Directory Structure

```text
bluetooth_controller/
├─ app.js
├─ app.json
├─ app.wxss
├─ project.config.json
├─ project.private.config.json
├─ sitemap.json
├─ pages
│  ├─ index
│  │  ├─ index.js
│  │  ├─ index.json
│  │  ├─ index.wxml
│  │  └─ index.wxss
│  └─ logs
│     ├─ logs.js
│     ├─ logs.json
│     ├─ logs.wxml
│     └─ logs.wxss
└─ utils
   ├─ locales.js
   └─ util.js
```

## Tech Stack and Environment Dependencies

This project is built as a WeChat Mini Program and mainly uses:

- WXML
- WXSS
- JavaScript
- WeChat Mini Program BLE API
- WeChat Mini Program WebSocket API
- WeChat Canvas 2D

This module needs to run on a mobile device that supports WeChat Mini Programs, or inside the WeChat DevTools test environment.

The project requires the following capabilities, which are declared in `app.json`:

- Phone Bluetooth
- Album write permission
- Network access
- Landscape page display

## Main Features

### 1. Bluetooth Scanning and Connection

<p align="center">
   <img alt="Bluetooth scanning page" src="https://github.com/user-attachments/assets/9199b2f6-df6e-4b20-ac58-bdd382e5c4c1" width="600"/>
</p>

As shown above, after startup the program initializes the Bluetooth adapter and supports scanning nearby BLE devices.

The connection flow is:

- Scan nearby Bluetooth devices
- Select a target device to connect
- Obtain BLE services and characteristics
- The current implementation searches for a service containing `FFE0`
- It uses the characteristic containing `FFE1` for reading and writing

This is consistent with the common usage pattern of HC-08 Bluetooth serial transparent modules.

### 2. Button Mode Control

In button mode, the UI provides directional buttons and function buttons.

Directional control is implemented through the following commands:

- `# U`
- `# D`
- `# L`
- `# R`

Pressing a button sends the uppercase command, and releasing it sends the corresponding lowercase command.

### 3. Joystick Mode Control

After switching to joystick mode, the UI changes to a virtual joystick:

- It calculates the direction vector `(x, y)` from touch offset
- Sends `: V vx vy` at a fixed interval
- Sends `: V 0.0000 0.0000` after release

At the same time it sends:

- `: SM JS` to enter joystick mode
- `: SM BT` to return to button mode

### 4. Speed Adjustment

The UI contains a speed slider. When it changes, the app sends:

```text
: SPD n
```

This is used to adjust the chassis speed level.

### 5. Raw Command Input

The interface keeps a raw command input box, which can send plain text commands directly to the device for protocol debugging.

### 6. Video Viewing

The Mini Program supports connecting to the Raspberry Pi video stream service through WebSocket.

The default connection address in code is:

```text
ws://192.168.137.178:8765
```

After a successful connection:

- It receives JPEG Base64 image frames
- Draws them onto the UI using Canvas
- Displays them in a draggable video window

### 7. Photo Capture and Recording Control

The video window contains buttons for taking photos and recording video. The commands sent are:

- `: CAM SHOT`
- `: CAM REC`
- `: CAM END`

When the Raspberry Pi returns a Base64 image starting with `PHOTO:`, the Mini Program will:

- Write it to a temporary file
- Save it to the phone album

### 8. AI and Tracking Control

The interface supports direct control of the vision features:

- `: AI 1/0`
- `: TRK 1/0`

These correspond to enabling or disabling recognition and tracking functions.

### 9. Gimbal Control

The left and right sides of the interface provide buttons for gimbal adjustment:

- Left-right adjustment for `LR`
- Up-down adjustment for `UD`

The command format is:

- `: SVO LR angle`
- `: SVO UD angle`

The sent angle is negated in code to match the actual hardware behavior.

### 10. Log Display

The page contains a mini console for displaying:

- Send logs `Tx>`
- Receive logs `Rx<`
- System status logs

## Page Structure

<p align="center">
   <img alt="Main page layout 1" src="https://github.com/user-attachments/assets/7eea0691-a95d-4feb-a083-b8b55d21018a" width="600"/>
   <img alt="Main page layout 2" src="https://github.com/user-attachments/assets/e87ab33d-26d7-478b-96e8-b8d22478e4e1" width="600"/>
</p>

As shown above, the main page `pages/index/index.wxml` contains the following areas:

- Connection and scanning interface
- Device list
- Chinese-English toggle button
- Log display area
- Command input area
- Left-side directional control area
- Center system and speed control area
- Right-side function key area
- Gimbal control area
- Draggable video window

## Multilingual Support

The project implements bilingual Chinese-English text resources in `utils/locales.js`.

At startup it automatically selects the display language based on the system language, and also supports manual switching.

## Cooperation with Other Modules

This module forwards all user input to the mbed main control program, which then either handles the command directly or forwards it further to the Raspberry Pi.

## Running and Debugging

### Development Method

It is recommended to open the project directory with WeChat DevTools for development and debugging.

### Debugging Tips

- If devices cannot be scanned, check phone Bluetooth and permissions
- If the connection fails, check whether the target module is a BLE serial device
- If data cannot be sent or received, check whether the `FFE0/FFE1` service and characteristic match
- If the video cannot be opened, check the Raspberry Pi IP address and WebSocket service status
- If photo saving fails, check whether album permission has been granted

