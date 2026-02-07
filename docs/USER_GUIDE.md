# Gateway Configurator - User Guide

This guide explains how to configure USR IOT gateways (N720, N510) to collect energy meter data and send it to ThingsBoard.

---

## Table of Contents

1. [Overview](#overview)
2. [ThingsBoard Device Setup](#thingsboard-device-setup)
3. [Gateway Configuration](#gateway-configuration)
4. [Adding Energy Meters](#adding-energy-meters)
5. [ThingsBoard Rule Chain Configuration](#thingsboard-rule-chain-configuration)
6. [Supported Devices](#supported-devices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The Gateway Configurator is a web application that simplifies the configuration of USR IOT gateways for energy monitoring. It handles:

- Gateway discovery on the local network
- MQTT broker configuration
- Energy meter setup with Modbus registers
- Automatic JSON template generation for ThingsBoard

---

## ThingsBoard Device Setup

Before configuring the gateway, you must create the correct type of device in ThingsBoard.

### Step 1: Choose Device Type

| Scenario | ThingsBoard Device Type | MQTT Topic |
|----------|------------------------|------------|
| **Multiple meters** through same gateway | Gateway | `v1/gateway/telemetry` |
| **Single meter** only | Standard Device | `v1/devices/me/telemetry` |

- **If more than one energy meter will be connected through the same MQTT gateway:**
  ✅ Create a **Gateway** device in ThingsBoard.

- **If only one energy meter will be connected:**
  ✅ A standard (simple) device is sufficient.

### Step 2: Retrieve the Access Token

Once the device is created in ThingsBoard:

1. Open the created device.
2. Navigate to the **Credentials** tab.
3. Copy the **Access Token**.

This token will be required later in the gateway configuration.

---

## Gateway Configuration

### Step 1: Connect to Gateway

1. Open the Gateway Configurator application.
2. Click **Scan Network** to discover gateways on your local network.
3. Select your gateway from the list, or enter the IP address manually.
4. Click **Connect**.

### Step 2: Configure MQTT Settings

In the **MQTT Configuration** section:

| Field | Description |
|-------|-------------|
| **Server Address** | ThingsBoard MQTT broker address (e.g., `thingsboard.example.com`) |
| **Port** | MQTT port (default: `1883`, or `8883` for SSL) |
| **Access Token** | Paste the token retrieved from ThingsBoard |
| **Gateway Name** | Must match the device name in ThingsBoard |

> ⚠️ **Note:** The Gateway Name must match:
> - The **Gateway device name** in ThingsBoard (if using a gateway device), or
> - The **device name** (if using a single device)

### Step 3: Save MQTT Configuration

Click **Save MQTT Settings** to apply the configuration.

---

## Adding Energy Meters

### Step 1: Navigate to Energy Meters

In the main interface, locate the **Energy Meters** section.

### Step 2: Add a New Meter

1. Click **Add Meter**.
2. Fill in the required fields:

| Field | Description |
|-------|-------------|
| **Meter Name** | Display name for the meter (e.g., "Building A - Floor 1") |
| **Meter Type** | Select from supported meter types (EM4371, XMC34F, etc.) |
| **Slave Address** | Modbus address of the meter (1-247) |

3. Click **Add** to add the meter.

### Step 3: Configure Multiple Meters (Optional)

Repeat Step 2 for each additional energy meter connected to the gateway.

### Step 4: Save Configuration

1. Click **Save to Gateway** to apply all changes.
2. The gateway will restart automatically.
3. Wait approximately 30 seconds for the gateway to come back online.

> ℹ️ **Info:** The application automatically generates the correct JSON structure and Modbus configuration for each meter type.

---

## ThingsBoard Rule Chain Configuration

After saving the gateway configuration, the energy meters will appear automatically in ThingsBoard.

### Step 1: Verify Devices

1. Go to ThingsBoard.
2. Navigate to **Devices**.
3. The newly configured energy meters should appear as new devices.

### Step 2: Configure Rule Chain

For each newly created energy meter device:

1. Open the device.
2. Go to **Details** tab.
3. Change the **Rule Chain** to the correct type.

**Recommended Rule Chain Selection:**

- Use the **Energy Meter** rule chain if available.
- Otherwise, use the **1-to-1 rule chain**.

### Important: Do Not Rename Devices (Gateway Mode)

If **Gateway mode** was selected (multiple meters):

> ⚠️ **Do not rename the automatically created meter devices in ThingsBoard.**

If device names are changed manually, the gateway will no longer recognize them and will create new duplicate devices.

---

## Supported Devices

### Gateway Models

| Model | Status |
|-------|--------|
| USR-N720 | ✅ Fully Supported |
| USR-N510 | ✅ Fully Supported |

### Energy Meter Types

| Meter Type | Data Points | Description |
|------------|-------------|-------------|
| **EM4371** | 17 | Eastron EM4371 Multi-function Meter |
| **XMC34F** | 30 | XMC34F Energy Analyzer |
| **Sfere720** | 25 | Sfere 720 Power Meter |
| **EnergyNG9** | 20 | Energy NG9 Meter |
| **TAC4300** | 22 | TAC 4300 Energy Meter |

---

## Troubleshooting

### Gateway Not Found During Scan

- Ensure the gateway is powered on and connected to the network.
- Check that your computer is on the same network/subnet as the gateway.
- Try entering the gateway IP address manually.

### MQTT Connection Failed

- Verify the ThingsBoard server address is correct.
- Check that the access token matches the device in ThingsBoard.
- Ensure port 1883 (or 8883 for SSL) is not blocked by firewall.

### Meter Data Not Appearing in ThingsBoard

- Verify the Modbus slave address is correct.
- Check that the meter is properly wired to the RS485 port.
- Ensure the baud rate matches the meter configuration (default: 9600).

### Device Names Show Underscores

If device names appear with underscores (e.g., "Device_1" instead of "Device 1"):

- This is a display issue in the CSV configuration.
- The correct name is stored in the report template and will be used in ThingsBoard.
- Re-save the configuration if needed.

---

## Quick Reference

### MQTT Topics

| Topic | Use Case |
|-------|----------|
| `v1/gateway/telemetry` | Multiple meters through gateway device |
| `v1/devices/me/telemetry` | Single meter / single device |

### Default Settings

| Setting | Default Value |
|---------|---------------|
| Reporting Interval | 60 seconds |
| MQTT QoS | 1 (At-least-once) |
| Modbus Protocol | RTU |
| Baud Rate | 9600 |
| Data Bits | 8 |
| Parity | None |
| Stop Bits | 1 |

---

## Support

For additional support or to report issues, please contact your system administrator or refer to the project repository.
