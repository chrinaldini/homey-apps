---
name: homey-app
description: Expert guide for developing Homey apps using SDK v3. Use when creating, debugging, or improving Homey apps — covers app structure, drivers, devices, flow cards, capabilities, pairing, settings, and Cloud compatibility.
argument-hint: "[what to build or fix]"
---

# Homey App Development — SDK v3 Best Practices

You are an expert Homey app developer. Apply everything below when writing, reviewing, or debugging Homey apps.

## Prerequisites

- Node.js v18 or higher (NVM recommended; v22 on Homey v12.9.0+)
- Docker (required for Homey Cloud and Homey Pro Early 2023)
- NPM (included with Node.js)

## CLI Installation & Key Commands

```bash
npm install --global --no-optional homey
```

Superuser rights may be required for global installation.

### App Commands

| Command | Description |
|---|---|
| `homey app create` | Create new empty Homey app |
| `homey app run` | Run in dev mode; live console output; uninstalls on exit |
| `homey app install` | Install without keeping command running |
| `homey app publish` | Publish to Homey App Store |
| `homey app validate` | Validate App Manifest (default: debug level) |
| `homey app validate --level publish` | Required for App Store publication on Homey Pro |
| `homey app validate --level verified` | Required for Verified Developer / Homey Cloud |
| `homey app version` | Update version (patch/minor/major) |
| `homey app driver create` | Add a new driver |
| `homey app driver capabilities` | Toggle driver capabilities visually |
| `homey app flow create` | Add a new Flow card |
| `homey app driver flow create` | Add Flow card with device filtering |
| `homey app add-types` | Install TypeScript packages |
| `homey app compose` | Migrate app to Homey Compose format |
| `homey app view` | Open App Store page |
| `homey app dependencies install` | Install libraries (pre-compiles for Python) |
| `homey app dependencies add` | Add library with optional version constraint |
| `homey app dependencies remove` | Remove dependency |
| `homey app dependencies list` | Show dependency structure |
| `homey app widget create` | Create a new widget |
| `homey app translate --api-key "..."` | Auto-translate using OpenAI |

### Authentication & Utilities

| Command | Description |
|---|---|
| `homey login` | Authenticate via OAuth2 |
| `homey logout` | Clear account login |
| `homey select` | Choose target Homey device |
| `homey docs` | Open SDK documentation |
| `homey --help` | Full command listing |

All app commands default to current working directory; support `--path` option.

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
│   ├── discovery/            ← device discovery configs
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
├── widgets/                  (requires app compatibility >=12.3.0)
├── env.json                  (environment variables — MUST be in .gitignore!)
├── .homeyignore              (like .gitignore; excludes files from publish)
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
- App name: max 4 words, no protocol names (no "Zigbee", "Z-Wave", "433 MHz", "Infrared")
- Pre-release versions NOT allowed (e.g., `1.0.0-rc.1`)
- `category` must be one of: `lights`, `video`, `music`, `appliances`, `security`, `climate`, `tools`, `internet`, `localization`, `energy`

### Environment Variables (`env.json`)

```json
{
  "CLIENT_ID": "12345abcde",
  "CLIENT_SECRET": "182hr2389r824ilikepie1302r0832"
}
```

Access: `Homey.env.CLIENT_ID`. **Must be in `.gitignore`.**

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
- Card titles: short and clear; no device names; no When/And/Then prefixes; no parentheses

### Flow Card Visibility Flags

| Flag | Effect |
|---|---|
| `"highlight": true` | Prominent display |
| `"advanced": true` | Advanced Flow only (auto-implied by `"tokens"` property) |
| `"deprecated": true` | Functional but hidden from Add Card list |
| `"platforms": ["local", "cloud"]` | Platform restriction |

### ManagerFlow API

```javascript
this.homey.flow.getActionCard(id)           // FlowCardAction
this.homey.flow.getConditionCard(id)        // FlowCardCondition
this.homey.flow.getDeviceTriggerCard(id)    // FlowCardTriggerDevice
this.homey.flow.getTriggerCard(id)          // FlowCardTrigger
this.homey.flow.createToken(id, opts)       // creates FlowToken
this.homey.flow.getToken(id)                // existing FlowToken
this.homey.flow.unregisterToken(tokenInstance)
```

### `$filter` for Device Cards

```json
"$filter": "class=socket|light"
"$filter": "capabilities=onoff,dim"
"$filter": "class=socket&capabilities=onoff,dim"
```

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
- `data` = immutable (set at pairing). Never store IPs or tokens there. Use MAC address (good), NOT IP address (bad — can change).
- `store` = mutable runtime data (IP, auth tokens)
- `settings` = user-visible configurable values
- Never give a device both `measure_battery` AND `alarm_battery` — pick one
- `addCapability()` and `setCapabilityOptions()` are expensive — never call in loops or on every poll
- `removeCapability()` breaks existing user Flows — avoid
- Sub-capabilities: `measure_temperature.inside` and `measure_temperature.outside`
- Flow cards are NOT auto-generated for sub-capabilities — create custom Flow cards

### `capabilitiesOptions` in Driver Manifest

| Option | Effect |
|---|---|
| `title` | Localized capability name (2-3 words max) |
| `preventInsights` | Disable automatic Insights generation |
| `preventTag` | Disable automatic Flow Tag creation |
| `duration: true` | Enable user-specified duration (ms) in Flow cards |
| `units` | Measurement units (`°C` auto-converts to Fahrenheit) |
| `decimals` | UI display precision |
| `min` / `max` | Value boundaries |
| `step` | Increment size |
| `zoneActivity: false` | Prevent zone activation for motion/contact/occupancy |
| `approximated: true` | For `measure_power` indicating uncertain measurement |
| `setOnDim: false` | For `onoff`: prevent state change when `dim` updates |
| `getable: false` | Stateless capability; disables quick actions and Flow cards |
| `maintenanceAction: true` | Flag button as maintenance action (v3.1.0+) |

### UI Components

| Component | Accepts | Purpose |
|---|---|---|
| `toggle` | boolean | Single on/off switch |
| `slider` | number | Numeric input with range |
| `sensor` | number/enum/string/boolean | Display multiple values; `alarm_*` true = flash red |
| `thermostat` | target_temperature + measure_temperature | Climate control |
| `media` | speaker_* capabilities | Audio playback controls |
| `color` | light_hue, light_saturation, light_temperature, light_mode | Color picker |
| `battery` | measure_battery or alarm_battery | Battery status |
| `picker` | enum | List selection (values 1-3 words) |
| `ternary` | enum (3 values) | Motorized controls (up/idle/down) |
| `button` | boolean | Stateless or stateful button |
| `null` | any | Hide UI component |

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

**Reserved ID prefixes (cannot use):** `homey:`, `zw_`, `zb_`, `mtr_`, `thread_`, `zone_`, `energy_`, `satellite_mode_`, `homekit_`

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

Supported language codes: `en`, `nl`, `de`, `fr`, `it`, `sv`, `no`, `es`, `da`, `ru`, `pl`, `ko`, `ar`

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
3. **No local discovery** (mDNS/SSDP/MAC not available on Cloud via Homey Bridge)
4. **Always handle promise rejections** — unhandled = app crash
5. **No absolute file paths** — use `require('./assets/foo.js')` or `path.join(__dirname, 'myfile.svg')`
6. **SDK v3 only** (Cloud doesn't support v1/v2)
7. **No App Web API** on Cloud — use webhooks instead
8. **No app-to-app communication** (`homey:app:<appId>`, `homey:manager:api`) on Cloud
9. **Verified Developer subscription required** to publish to Cloud

### Connectivity Support on Cloud

| Value | Cloud Support |
|---|---|
| `lan` | NOT supported via Homey Bridge |
| `cloud` | Yes (OAuth/webhook) |
| `ble` | Yes |
| `zwave` | Yes |
| `zigbee` | Yes |
| `infrared` | Yes |
| `rf433` | Yes |
| `rf868` | NOT supported via Homey Bridge |

## Publishing Workflow

```bash
# 1. Validate before publishing
homey app validate --level publish       # for Homey Pro App Store
homey app validate --level verified      # for Verified Developer / Cloud

# 2. Publish
homey app publish
```

### Validation Levels

| Level | Description |
|---|---|
| `debug` | Development; images/brandColor/category optional |
| `publish` | Required for App Store publication on Homey Pro |
| `verified` | Required for Verified Developer / Homey Cloud; adds platforms, connectivity, support requirements |

### Release Process

1. Submit as **Draft**
2. Release as **Test** version (accessible via `https://homey.app/en-us/app/APP.ID/test/`)
3. Submit for certification by Athom
4. Approval → publish to Homey App Store

**First-time apps require certification before becoming publicly available. Review takes up to 2 weeks.**

### Versioning Rules

- Must use Semantic Versioning (no pre-release: not `1.0.0-rc.1`)
- **Homey will never downgrade apps**
- To revert: resubmit older build with **higher** version number
- Use `homey app version` to bump patch/minor/major

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
| Cloud app crash | Unhandled promise rejection |
| Global state corruption on Cloud | Module-level variables shared between instances — use `this` |

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

### Discovery Strategy (driver.js)

```javascript
async onPairListDevices() {
  const discoveryStrategy = this.getDiscoveryStrategy();
  const discoveryResults = discoveryStrategy.getDiscoveryResults();
  return Object.values(discoveryResults).map(result => ({
    name: result.txt.name,
    data: { id: result.id }
  }));
}
```

### Discovery Config (.homeycompose/discovery/my_discovery.json)

```json
{
  "type": "mdns-sd",
  "mdns-sd": { "name": "mydevice", "protocol": "tcp" },
  "id": "{{txt.id}}"
}
```

Reference in driver: `"discovery": "my_discovery"` in `driver.compose.json`.

mDNS, SSDP, and MAC discovery are **NOT supported on Homey Cloud**.

## Webhooks

```javascript
// env.json: { "WEBHOOK_ID": "...", "WEBHOOK_SECRET": "..." }
const myWebhook = await this.homey.cloud.createWebhook(
  Homey.env.WEBHOOK_ID,
  Homey.env.WEBHOOK_SECRET,
  {}
);
myWebhook.on('message', args => {
  this.log('body:', args.body);
});

// Get webhook URL to give to cloud service:
const homeyId = await this.homey.cloud.getHomeyId();
const webhookUrl = `https://webhooks.athom.com/webhook/${Homey.env.WEBHOOK_ID}?homey=${homeyId}`;
```

Create webhooks at: `https://tools.developer.homey.app/webhooks`

## Image Requirements

| Asset | Dimensions | Format |
|-------|-----------|--------|
| App icon | full canvas SVG | transparent bg |
| App small | 250×175px | PNG/JPG |
| App large | 500×350px | PNG/JPG |
| App xlarge | 1000×700px | PNG/JPG |
| Driver icon | 960×960px SVG | transparent bg, right-side angle view |
| Driver small | 75×75px | PNG/JPG |
| Driver large | 500×500px | PNG/JPG |
| Driver xlarge | 1000×1000px | PNG/JPG |

**App Store guidelines for images:**
- App images: no logos, clipart, screenshots; no big flat shapes on monochrome background
- Driver images: white background; recognizable actual device photo; unique per driver
- Driver icon: unique per driver; cannot use driver image or app icon; transparent background
- App icon: cannot use driver icon; no text if possible

## App Store Guidelines

- **App name**: must match brand name; max 4 words; cannot include "Homey", "Athom", "Zigbee", "Z-Wave", "433 MHz", "Infrared"
- **Description**: one-liner; not a repeat of the app name or README; must communicate value clearly
- **README**: 1-2 paragraphs; no headers, markdown, URLs, or changelog; plain text only
- **Language**: English mandatory; zero typos allowed (apps rejected for spelling errors)
- **Flow card titles**: short; no device names; no When/And/Then prefixes; no parentheses
- **Apps must be free** (paid subscriptions on provider side are OK)

## Key URLs

| Resource | URL |
|---|---|
| Developer tools & dashboard | `https://tools.developer.homey.app` |
| Webhook management | `https://tools.developer.homey.app/webhooks` |
| SDK v3 API reference | `https://apps-sdk-v3.developer.homey.app/` |
| App SDK issues | `https://github.com/athombv/homey-apps-sdk-issues/issues` |
| Community forum | `https://community.athom.com` |
| Partnership inquiries | `partners@athom.com` |
| Test link format | `https://homey.app/en-us/app/APP.ID/test/` |
