# Gateway Configurator User Guide

## Overview

The **Gateway Configurator** is a web-based application developed by **PME - Power Under Control** for configuring USR IOT industrial gateways. This tool simplifies the process of setting up energy meters and connecting them to ThingsBoard IoT platform via MQTT.

### Supported Gateways

| Gateway Model | Description |
|---------------|-------------|
| **N510** | Compact industrial gateway for small-scale deployments |
| **N720** | Advanced industrial gateway for multi-device configurations |

---

## Prerequisites

Before using the Gateway Configurator, ensure you have:

- A USR IOT Gateway (N510 or N720) connected to your local network
- Network access to the gateway's IP address
- A ThingsBoard account with appropriate permissions
- Energy meters connected to the gateway via RS485/Modbus

---

## Quick Start Guide

### Step 1: Connect to the Gateway

1. Open the Gateway Configurator application in your web browser
2. The application will automatically scan for available gateways on your network
3. Click on the discovered gateway to connect, or enter the gateway IP address manually
4. Enter the gateway credentials (default: admin/admin)

![Gateway Scanner](images/gateway-scanner.png)

---

### Step 2: Initialize Configuration (New Devices Only)

> **Important:** This step is only required for brand new gateways or after a factory reset.

1. Navigate to the **Status** tab
2. Click the **"Init Config"** button to initialize the gateway with default settings
3. Wait for the initialization process to complete
4. The gateway may reboot automatically

---

### Step 3: Configure ThingsBoard Integration

Before configuring the gateway, you need to create a device or gateway in ThingsBoard:

#### For Single Device Setup (Non-ThingsBoard Gateway Topic)
1. Log in to your ThingsBoard instance
2. Navigate to **Devices** → **Add New Device**
3. Enter a device name and click **Add**
4. Copy the **Access Token** from the device details

#### For Multiple Devices Setup (ThingsBoard Gateway Topic)
1. Log in to your ThingsBoard instance
2. Navigate to **Devices** → **Add New Device**
3. Select **"Is Gateway"** checkbox
4. Enter a gateway name and click **Add**
5. Copy the **Access Token** from the device details

---

### Step 4: Gateway MQTT Setup

1. Navigate to the **Gateway Setup** tab in the configurator
2. Configure the following settings:

| Field | Description | Example |
|-------|-------------|---------|
| **MQTT Broker** | ThingsBoard MQTT server address | `mqtt.thingsboard.cloud` or your server IP |
| **Port** | MQTT broker port | `1883` (or `8883` for SSL) |
| **Client ID** | Identifier for the MQTT connection | `my-gateway-01` |
| **Access Token** | Token copied from ThingsBoard | `A1B2C3D4E5F6G7H8` |

3. Click **Save** to apply the MQTT configuration

> **Note:** The Client ID is used for MQTT connection identification and does not affect ThingsBoard device naming.

#### SD Card Formatting (Optional)

If the gateway has an SD card installed for local data storage, you can format it from the Gateway Setup section:

1. In the **Gateway Setup** tab, locate the **SD Card** section
2. Click **"Format SD Card"** to erase all data and prepare the card for use
3. Confirm the action when prompted

> **Warning:** Formatting the SD card will permanently delete all stored data. Use this option only when necessary.

---

### Step 5: Add Energy Meters

1. Navigate to the **Energy Meters** tab
2. Click **"Add Meter"** to open the meter configuration dialog
3. Fill in the meter details:

| Field | Description | Example |
|-------|-------------|---------|
| **Meter Name** | Display name for the meter | `Building A - Floor 1` |
| **Meter Type** | Select the energy meter model | `EM4371`, `XMC34F`, etc. |
| **Slave Address** | Modbus slave address (1-247) | `1` |

4. Click **Add** to add the meter to the configuration
5. Repeat for additional meters

#### MQTT Topic Configuration

| Topic | Devices Allowed | Use Case |
|-------|-----------------|----------|
| `v1/gateway/telemetry` | Multiple | ThingsBoard Gateway mode - recommended for multiple meters |
| `v1/devices/me/telemetry` | Single | Direct device telemetry - for single meter setups |
| Custom | Single | Custom integrations |

> **Important:** When using topics other than `v1/gateway/telemetry`, only one energy meter can be configured.

---

### Step 6: Configure Reporting Settings

1. Set the **Reporting Interval** (in seconds) - how often data is sent to ThingsBoard
2. Select or enter the **Report Topic** based on your ThingsBoard setup
3. Recommended interval: 60 seconds for most applications

---

### Step 7: Save and Apply Configuration

1. Review all configured meters in the list
2. Click **"Save to Gateway"** to upload the configuration
3. When prompted, click **Yes** to reboot the gateway
4. Wait approximately 30 seconds for the gateway to restart

> **Warning:** Always use this application to restart the gateway after making changes. Using the native gateway UI may overwrite your configuration.

---

## Verification

After the gateway reboots:

1. Return to the **Status** tab to verify the gateway is online
2. Check the **MQTT Connection Status** shows "Connected"
3. In ThingsBoard, verify that telemetry data is being received from your devices

---

## Troubleshooting

### Gateway Not Found

- Ensure the gateway is powered on and connected to the network
- Verify your computer is on the same network segment
- Try entering the gateway IP address manually

### MQTT Connection Failed

- Verify the MQTT broker address and port
- Check that the Access Token is correct
- Ensure your network allows outbound connections on the MQTT port

### No Data in ThingsBoard

- Verify the energy meters are properly connected via RS485
- Check the Modbus slave addresses match the physical meter configuration
- Review the reporting interval settings

### Configuration Lost After Reboot

- Always use the Gateway Configurator to restart the gateway
- Avoid using the native gateway web interface after configuration

---

## Supported Energy Meters

### N510 Gateway

| Meter Type | Description | Data Points |
|------------|-------------|-------------|
| XMC34F | Standard 3-phase meter | 12 |
| XMC34F_Lite | Lite version with essential readings | 8 |

### N720 Gateway

| Meter Type | Description | Data Points |
|------------|-------------|-------------|
| EM4371 | High-precision 3-phase analyzer | 27 |
| XMC34F | Standard 3-phase meter | 12 |

---

## Technical Specifications

### Communication Protocols

- **Modbus RTU** over RS485 for meter communication
- **MQTT** for cloud connectivity (ThingsBoard)

### Data Format

The gateway sends telemetry data in JSON format:

**Single Device Format:**
```json
{
  "v_l1": 230.5,
  "v_l2": 231.2,
  "v_l3": 229.8,
  "i_l1": 12.3,
  "power_total": 8500
}
```

**Multiple Devices Format (Gateway Mode):**
```json
{
  "Device Name 1": [{
    "ts": 1699459200000,
    "values": {
      "v_l1": 230.5,
      "power_total": 8500
    }
  }],
  "Device Name 2": [{
    "ts": 1699459200000,
    "values": {
      "v_l1": 228.3,
      "power_total": 4200
    }
  }]
}
```

---

## Support

For technical support or questions, please contact:

**PME - Power Under Control**

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024 | Initial release with N510 and N720 support |

---

*Gateway Configurator v1.0 - PME - Power Under Control*
