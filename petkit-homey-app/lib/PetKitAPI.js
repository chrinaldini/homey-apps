'use strict';

const { createHash } = require('crypto');
const https = require('https');
const http = require('http');

// Region to API base URL mapping (reverse-engineered from PetKit app)
const REGION_URLS = {
  'EU':      'https://api.eu.petkt.com/latest',
  'US':      'https://api.petkt.com/latest',
  'Asia':    'https://api.petktasia.com/latest',
  'China':   'https://api.petkit.cn/6',
  'default': 'https://api.petkt.com/latest',
};

const DEVICE_TYPE_MAP = {
  1:  'Feeder Mini',
  3:  'Fresh Element',
  4:  'Fresh Element (D4)',
  5:  'Fresh Element Gemini',
  6:  'Pura X',
  7:  'Eversweet 3 Pro',
  8:  'Pura MAX',
  9:  'Eversweet 5 Mini',
  10: 'Fresh Element Solo',
  13: 'YumShare Dual-Hopper',
  14: 'Pura MAX 2',
  24: 'Pura Air',
  25: 'Air Magicube',
  32: 'Eversweet Solo 2',
  40: 'Eversweet MAX',
  41: 'YumShare Solo',
  56: 'Purobot',
};

// Device type categories
const LITTER_BOX_TYPES  = [6, 8, 14, 56];
const FEEDER_TYPES      = [1, 3, 4, 5, 10, 13, 41];
const FOUNTAIN_TYPES    = [7, 9, 32, 40];
const PURIFIER_TYPES    = [24, 25];

class PetKitAPI {
  constructor({ email, password, region = 'EU' }) {
    this.email    = email;
    this.password = password;
    this.region   = region;
    this.baseUrl  = REGION_URLS[region] || REGION_URLS['default'];
    this.token    = null;
    this.userId   = null;
  }

  // -------------------------------------------------------------------
  // HTTP helper – wraps Node's built-in http/https so no npm deps needed
  // -------------------------------------------------------------------
  _request(method, path, { body = null, extraHeaders = {} } = {}) {
    return new Promise((resolve, reject) => {
      const url      = new URL(this.baseUrl + path);
      const isHttps  = url.protocol === 'https:';
      const lib      = isHttps ? https : http;
      const postData = body ? JSON.stringify(body) : null;

      const headers = {
        'Content-Type':     'application/json',
        'X-Api-Version':    '11.1.1',
        'X-Img-Version':    '1',
        'Accept':           'application/json',
        'User-Agent':       'PETKIT/11.1.1 (iPhone; iOS 16.0; Scale/3.00)',
        'X-TimezoneId':     'Europe/Oslo',
        'X-Client':         'ios(16.0;iPhone)',
        'X-Locale':         'en_US',
        ...extraHeaders,
      };

      if (this.token) {
        headers['X-Session'] = this.token;
      }

      if (postData) {
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const options = {
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method,
        headers,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`PetKit API error: ${parsed.error.msg || JSON.stringify(parsed.error)}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  // -------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------
  async login() {
    const md5Password = createHash('md5').update(this.password).digest('hex');

    const result = await this._request('POST', '/user/login', {
      body: {
        username: this.email,
        password: md5Password,
        client_id: 'ios',
        oldVersion: '',
        source: 1,
        system: 'iOS 16.0',
        timezone: 8.0,
        timezoneId: 'Europe/Oslo',
      },
    });

    const session = result.result?.session;
    if (!session || !session.id) {
      throw new Error('Login failed: no session token returned');
    }

    this.token  = session.id;
    this.userId = session.userId;
    return { token: this.token, userId: this.userId };
  }

  // -------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------
  async getDevices() {
    if (!this.token) throw new Error('Not logged in');

    const result = await this._request('GET', '/discovery/device_roster');
    const devices = [];

    const roster = result.result?.deviceRoster || result.result || {};

    // Feeders
    const feeders = roster.feeders || [];
    for (const d of feeders) {
      devices.push(this._normalizeDevice(d, 'feeder'));
    }

    // Litter boxes
    const litterBoxes = roster.devices || roster.litterBoxes || [];
    for (const d of litterBoxes) {
      devices.push(this._normalizeDevice(d, this._guessCategory(d.type)));
    }

    // Water fountains
    const fountains = roster.waterFountains || [];
    for (const d of fountains) {
      devices.push(this._normalizeDevice(d, 'fountain'));
    }

    // Purifiers
    const purifiers = roster.purifiers || [];
    for (const d of purifiers) {
      devices.push(this._normalizeDevice(d, 'purifier'));
    }

    // Fallback: flat list
    if (devices.length === 0 && Array.isArray(result.result)) {
      for (const d of result.result) {
        devices.push(this._normalizeDevice(d, this._guessCategory(d.type)));
      }
    }

    return devices;
  }

  _guessCategory(type) {
    if (LITTER_BOX_TYPES.includes(type))  return 'litter_box';
    if (FEEDER_TYPES.includes(type))      return 'feeder';
    if (FOUNTAIN_TYPES.includes(type))    return 'fountain';
    if (PURIFIER_TYPES.includes(type))    return 'purifier';
    return 'other';
  }

  _normalizeDevice(raw, category) {
    return {
      id:         String(raw.id),
      name:       raw.name || raw.deviceName || `PetKit ${raw.id}`,
      type:       raw.type,
      typeName:   DEVICE_TYPE_MAP[raw.type] || `Type ${raw.type}`,
      category,
      online:     raw.state?.pim === 1 || raw.online || false,
      firmware:   raw.firmware || raw.mainboardVersion || 'Unknown',
      raw,
    };
  }

  // -------------------------------------------------------------------
  // Device status polling
  // -------------------------------------------------------------------
  async getDeviceStatus(deviceId, category) {
    if (!this.token) throw new Error('Not logged in');

    const endpoint = this._statusEndpoint(category);
    if (!endpoint) return null;

    const result = await this._request('GET', `${endpoint}?id=${deviceId}`);
    return result.result || null;
  }

  _statusEndpoint(category) {
    switch (category) {
      case 'feeder':     return '/feedermini/device_detail';
      case 'litter_box': return '/cat/litter/device_detail';
      case 'fountain':   return '/w5/device/detail';
      case 'purifier':   return '/puraair/device_detail';
      default:           return null;
    }
  }

  // -------------------------------------------------------------------
  // Litter box commands
  // -------------------------------------------------------------------
  async startCleaning(deviceId) {
    return this._litterCommand(deviceId, 'start_clean');
  }

  async stopCleaning(deviceId) {
    return this._litterCommand(deviceId, 'stop_clean');
  }

  async odorRemoval(deviceId) {
    return this._litterCommand(deviceId, 'odor_removal');
  }

  async dumpLitter(deviceId) {
    return this._litterCommand(deviceId, 'dump_litter');
  }

  async _litterCommand(deviceId, cmd) {
    return this._request('POST', '/cat/litter/clean', {
      body: { deviceId, cmd },
    });
  }

  // -------------------------------------------------------------------
  // Feeder commands
  // -------------------------------------------------------------------
  async manualFeed(deviceId, amount = 10) {
    // amount in units of 5g; PetKit uses 1 unit = 5g typically
    return this._request('POST', '/feedermini/save_dailyfeed', {
      body: {
        deviceId,
        day: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        time: -1,
        amount: Math.round(amount / 5),
      },
    });
  }

  async manualFeedD4(deviceId, amount = 10) {
    return this._request('POST', '/feeder/save_dailyfeed', {
      body: {
        deviceId,
        day: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        time: -1,
        amount: Math.round(amount / 5),
      },
    });
  }

  // -------------------------------------------------------------------
  // General setting update (light, etc.)
  // -------------------------------------------------------------------
  async updateSetting(deviceId, key, value) {
    return this._request('POST', '/device/updateSettings', {
      body: { deviceId, [key]: value },
    });
  }

  // -------------------------------------------------------------------
  // Static helpers
  // -------------------------------------------------------------------
  static getRegions() {
    return Object.keys(REGION_URLS).filter(r => r !== 'default');
  }

  static getDeviceTypeName(type) {
    return DEVICE_TYPE_MAP[type] || `Unknown (${type})`;
  }
}

module.exports = PetKitAPI;
