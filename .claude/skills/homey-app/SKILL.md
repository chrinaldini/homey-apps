---
name: homey-app
description: Expert guide for developing Homey apps using SDK v3. Use when creating, debugging, or improving Homey apps — covers app structure, drivers, devices, flow cards, capabilities, pairing, settings, and Cloud compatibility.
argument-hint: "[what to build or fix]"
---

# Homey App Development — SDK v3 Best Practices

You are an expert Homey app developer. Apply everything below when writing, reviewing, or debugging Homey apps.

## Project Structure

Use **Homey Compose** — never manually edit the root `app.json`:

```
my.app.id/
├── .homeycompose/
│   ├── app.json              ← source of truth for the manifest
│   ├── capabilities/         ← custom capability JSON files
│   ├── flow/
│   │   ├── triggers/
│   │   ├── conditions/
│   │   └── actions/
│   └── drivers/templates/   ← shared driver templates ($extends)
├── drivers/
│   └── my_driver/
│       ├── driver.js
│       ├── device.js
│       ├── driver.compose.json
│       ├── driver.flow.compose.json
│       ├── driver.settings.compose.json
│       └── assets/
│           ├── icon.svg          (960×960px canvas, transparent bg)
│           └── images/
│               ├── small.png     (75×75px)
│               ├── large.png     (500×500px)
│               └── xlarge.png    (1000×1000px)
├── locales/
│   ├── en.json
│   └── no.json
├── assets/
│   ├── icon.svg              (transparent bg, full canvas)
│   └── images/
│       ├── small.png         (250×175px)
│       ├── large.png         (500×350px)
│       └── xlarge.png        (1000×700px)
├── settings/index.html       (local Homey only — NOT for Cloud)
└── app.js
```

## app.json (.homeycompose/app.json)

Required fields for SDK v3:

```json
{
  "id": "com.brand.appname",
  "version": "1.0.0",
  "compatibility": ">=5.0.0",
  "sdk": 3,
  "platforms": ["local", "cloud"],
  "brandColor": "#FF6B35",
  "name": { "en": "My App", "no": "Min App" },
  "description": { "en": "Adds support for XYZ devices." },
  "category": "appliances",
  "images": {
    "small": "/assets/images/small.png",
    "large": "/assets/images/large.png",
    "xlarge": "/assets/images/xlarge.png"
  },
  "author": { "name": "Your Name", "email": "you@example.com" }
}
```

- `sdk`: must be `3`
- `compatibility`: `">=5.0.0"` for SDK v3
- `brandColor`: mandatory hex color
- App name: max 4 words, no protocol names (no "Zigbee", "Z-Wave", etc.)

## app.js

```javascript
'use strict';
const Homey = require('homey');

class MyApp extends Homey.App {
  async onInit() {
    this.log('App initialized');
    // Register app-level flow cards here
    // Share API client via this.homey.app from drivers/devices
    this.client = new MyApiClient();

    const myAction = this.homey.flow.getActionCard('my_action');
    myAction.registerRunListener(async (args) => {
      await this.client.doSomething(args.value);
    });
  }

  async onUninit() {
    // Cleanup connections
  }
}

module.exports = MyApp;
```

**Initialization order:** `App#onInit` runs BEFORE `Driver#onInit` and `Device#onInit`.
Access the app from drivers/devices via `this.homey.app`.

## driver.js

```javascript
'use strict';
const Homey = require('homey');

class MyDriver extends Homey.Driver {
  async onInit() {
    this.log('Driver initialized');

    // Register device-specific flow cards here (not in app.js)
    this._triggerTurnedOn = this.homey.flow.getDeviceTriggerCard('turned_on');

    const setMode = this.homey.flow.getActionCard('set_mode');
    setMode.registerRunListener(async (args) => {
      await args.device.setMode(args.mode);
    });
  }

  // Simple discovery-based pairing (no custom login needed)
  async onPairListDevices() {
    const devices = await this.homey.app.client.discoverDevices();
    return devices.map(d => ({
      name: d.name,
      data: { id: d.id },         // IMMUTABLE — permanent IDs only
      store: { ip: d.ip },        // MUTABLE — use for IP, tokens, etc.
      settings: { pollInterval: 30 },
      capabilities: ['onoff', 'dim'],
    }));
  }

  // Custom pairing with credentials
  async onPair(session) {
    let credentials = {};

    session.setHandler('login', async ({ username, password }) => {
      try {
        credentials.token = await MyApi.authenticate(username, password);
        credentials.username = username;
        return true; // true = success, false = failed
      } catch (err) {
        throw new Error(this.homey.__('errors.invalidCredentials'));
      }
    });

    session.setHandler('list_devices', async () => {
      const devices = await MyApi.getDevices(credentials.token);
      return devices.map(d => ({
        name: d.name,
        data: { id: d.id },
        store: { token: credentials.token },
        settings: { username: credentials.username },
        capabilities: MyDriver._capsForType(d.type),
      }));
    });

    session.setHandler('disconnect', () => {
      // User closed pairing dialog
    });
  }

  async onRepair(session, device) {
    session.setHandler('login', async ({ username, password }) => {
      const token = await MyApi.authenticate(username, password);
      await device.setStoreValue('token', token);
      return true;
    });
  }
}

module.exports = MyDriver;
```

## device.js

```javascript
'use strict';
const Homey = require('homey');

const POLL_INTERVAL_MS = 30 * 1000;

class MyDevice extends Homey.Device {
  async onInit() {
    this.log('Device init:', this.getName());

    // Register capability listeners (user/Homey → device)
    this.registerCapabilityListener('onoff', this._onOnoff.bind(this));

    // Group related capabilities (debounced 500ms)
    this.registerMultipleCapabilityListener(
      ['light_hue', 'light_saturation'],
      async (values) => this._setColor(values),
      500
    );

    // ALWAYS use this.homey.setInterval — not native setInterval
    this._pollTimer = this.homey.setInterval(
      () => this._poll(),
      (this.getSetting('pollInterval') || 30) * 1000
    );

    await this._poll(); // initial state sync
    this.log('Device ready:', this.getName());
  }

  async onDeleted() {
    // ALWAYS clean up timers and listeners
    this.homey.clearInterval(this._pollTimer);
    // Remove any EventEmitter listeners
    // Close open connections (WebSocket, etc.)
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('pollInterval')) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = this.homey.setInterval(
        () => this._poll(),
        newSettings.pollInterval * 1000
      );
    }
    // Throw to reject invalid settings and show error in UI
    if (newSettings.pollInterval < 5) {
      throw new Error(this.homey.__('errors.pollIntervalTooShort'));
    }
  }

  async _onOnoff(value) {
    await this.homey.app.client.setDeviceState(this.getData().id, { on: value });
  }

  async _poll() {
    try {
      const state = await this.homey.app.client.getDeviceState(this.getData().id);
      await this.setCapabilityValue('onoff', state.on);
      await this.setCapabilityValue('dim', state.brightness);

      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      this.error('Poll failed:', err.message);
      await this.setUnavailable(this.homey.__('errors.offline'));
    }
  }

  // Fire device trigger from the device (requires storing card in driver)
  _triggerSomething(tokens = {}) {
    this.driver._triggerTurnedOn
      .trigger(this, tokens)
      .catch(err => this.error('trigger:', err));
  }
}

module.exports = MyDevice;
```

## Flow Cards

### Define in driver.flow.compose.json

```json
{
  "triggers": [
    {
      "id": "turned_on",
      "title": { "en": "Device was turned on", "no": "Enhet ble slått på" },
      "tokens": [
        { "name": "power", "type": "number", "title": { "en": "Watt" }, "example": 100 }
      ]
    }
  ],
  "conditions": [
    {
      "id": "is_charging",
      "title": { "en": "Device !{{is|isn't}} charging", "no": "Enheten !{{lades|lades ikke}}" }
    }
  ],
  "actions": [
    {
      "id": "set_mode",
      "title": { "en": "Set mode", "no": "Sett modus" },
      "args": [
        {
          "name": "mode",
          "type": "dropdown",
          "title": { "en": "Mode", "no": "Modus" },
          "values": [
            { "id": "auto",   "title": { "en": "Auto",   "no": "Auto" } },
            { "id": "manual", "title": { "en": "Manual", "no": "Manuell" } }
          ]
        }
      ]
    }
  ]
}
```

**Critical rules for flow cards:**
- Every card ID registered via `getActionCard()`/`getDeviceTriggerCard()`/`getConditionCard()` **MUST** exist in the compose JSON — missing IDs throw an error and crash `onInit()`
- `!{{A|B}}` pattern: "A" normally, "B" when condition is inverted
- `[[arg_name]]` in `titleFormatted` inlines argument values
- Cards with `tokens` are Advanced Flows only
- Add `"deprecated": true` to retire a card without removing it

## Capabilities

### Custom capability in .homeycompose/capabilities/my_status.json

```json
{
  "type": "enum",
  "title": { "en": "Status", "no": "Status" },
  "getable": true,
  "setable": false,
  "uiComponent": "sensor",
  "values": [
    { "id": "idle",    "title": { "en": "Idle",    "no": "Inaktiv" } },
    { "id": "active",  "title": { "en": "Active",  "no": "Aktiv" } },
    { "id": "error",   "title": { "en": "Error",   "no": "Feil" } }
  ]
}
```

**Capability rules:**
- `data` = immutable (set at pairing). Never store IPs or tokens there.
- `store` = mutable runtime data (IP, auth tokens)
- `settings` = user-visible configurable values
- Never give a device both `measure_battery` AND `alarm_battery` — pick one
- `addCapability()` and `setCapabilityOptions()` are expensive — never call in loops or on every poll
- `removeCapability()` breaks existing user Flows — avoid
- Sub-capabilities: `measure_temperature.inside` and `measure_temperature.outside`

## driver.settings.compose.json

```json
[
  {
    "id": "pollInterval",
    "type": "number",
    "label": { "en": "Poll Interval (seconds)", "no": "Avlesningsintervall (sekunder)" },
    "value": 30,
    "min": 5,
    "max": 3600,
    "hint": { "en": "How often to check the device." }
  },
  {
    "id": "username",
    "type": "text",
    "label": { "en": "Username", "no": "Brukernavn" },
    "value": "",
    "highlight": true
  },
  {
    "id": "password",
    "type": "password",
    "label": { "en": "Password", "no": "Passord" },
    "value": ""
  }
]
```

Note: `setSettings()` programmatically updates settings but does NOT trigger `onSettings`.

## Error Handling — Critical Rules

```javascript
// CRASH — unhandled rejection
this.setCapabilityValue('onoff', true);
fetch(url);

// CORRECT inside async function
await this.setCapabilityValue('onoff', true);

// CORRECT in event callbacks
device.on('state', (state) => {
  this.setCapabilityValue('onoff', state.on).catch(this.error);
});
```

**Unhandled promise rejections are the #1 cause of Homey Cloud app crashes.**

## Timers — Always Use this.homey

```javascript
// WRONG — not cleaned up automatically
setInterval(() => this._poll(), 30000);
setTimeout(() => this._retry(), 5000);

// CORRECT
this._timer = this.homey.setInterval(() => this._poll(), 30000);
this._timeout = this.homey.setTimeout(() => this._retry(), 5000);

// Cleanup
this.homey.clearInterval(this._timer);
this.homey.clearTimeout(this._timeout);
```

## Localization

Always provide at least `en`. Norwegian (`no`) is strongly recommended for this project.

```json
// locales/en.json
{
  "pair": {
    "login": { "title": "Log in", "error": "Invalid credentials" }
  },
  "errors": {
    "offline": "Device is offline",
    "apiError": "API error: __message__"
  }
}
```

```javascript
// Usage in code
this.homey.__('errors.offline')
this.homey.__('errors.apiError', { message: err.message })
```

## Homey Cloud Compatibility

1. **No global variables** — store all state on `this` (App/Driver/Device)
2. **No custom settings pages** — gather everything during pairing
3. **No local discovery** (mDNS/SSDP not available on Cloud)
4. **Always handle promise rejections** — unhandled = app crash
5. **No absolute file paths**
6. **SDK v3 only** (Cloud doesn't support v1/v2)

## Common Bugs Checklist

| Bug | Fix |
|-----|-----|
| App crashes on startup | Flow card ID in JS not defined in compose JSON |
| Device unavailable after restart | Re-login logic missing in `_initAPI` / `onInit` |
| Memory leak | EventEmitter listeners not removed in `onDeleted` |
| Intervals keep running after device delete | Not calling `clearInterval` in `onDeleted` |
| Settings page broken on Cloud | Custom settings page — move to pairing |
| Wrong data in `device.data` | Mutable data (IP/token) belongs in `store`, not `data` |
| `getActionCard()` throws | Card ID missing from flow compose JSON |
| Timezone bug | Use `this.homey.clock.getTimezone()` — never `new Date().toLocaleDateString()` |
| `onPairListDevices` never resolves | Must be `async` |

## OAuth2 (recommended for OAuth2 services)

Use the `homey-oauth2app` library instead of rolling your own:

```javascript
// package.json dependency: "homey-oauth2app": "*"

// app.js
const { OAuth2App } = require('homey-oauth2app');
class MyApp extends OAuth2App {
  static OAUTH2_CLIENT = MyOAuth2Client;
}

// lib/MyOAuth2Client.js
const { OAuth2Client } = require('homey-oauth2app');
class MyOAuth2Client extends OAuth2Client {
  static API_URL = 'https://api.brand.com/v1';
  static TOKEN_URL = 'https://auth.brand.com/token';
  static AUTHORIZATION_URL = 'https://auth.brand.com/authorize';
  static SCOPES = ['read', 'write'];
  async getDevices() { return this.get({ path: '/devices' }); }
}

// driver.js
const { OAuth2Driver } = require('homey-oauth2app');
class MyDriver extends OAuth2Driver {
  async onPairListDevices({ oAuth2Client }) {
    return (await oAuth2Client.getDevices()).map(d => ({
      name: d.name, data: { id: d.id },
    }));
  }
}

// device.js
const { OAuth2Device } = require('homey-oauth2app');
class MyDevice extends OAuth2Device {
  async onOAuth2Init() {
    await this._poll();
  }
}
```

## Discovery-Based Devices (LAN — preferred over polling)

```javascript
// device.js
async onDiscoveryResult(discoveryResult) {
  return discoveryResult.id === this.getData().id;
}
async onDiscoveryAvailable(discoveryResult) {
  this.api = new DeviceApi(discoveryResult.address);
  await this.setAvailable();
}
async onDiscoveryAddressChanged(discoveryResult) {
  this.api = new DeviceApi(discoveryResult.address); // reconnect at new IP
}
```

## Image Requirements

| Asset | Dimensions | Format |
|-------|-----------|--------|
| App icon | full canvas SVG | transparent bg |
| App small | 250×175px | PNG/JPG |
| App large | 500×350px | PNG/JPG |
| App xlarge | 1000×700px | PNG/JPG |
| Driver icon | 960×960px SVG | transparent bg |
| Driver small | 75×75px | PNG/JPG |
| Driver large | 500×500px | PNG/JPG |
| Driver xlarge | 1000×1000px | PNG/JPG |
