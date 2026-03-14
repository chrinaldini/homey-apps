'use strict';

const Homey = require('homey');
const PetKitAPI = require('../../lib/PetKitAPI');

const POLL_MS = 60 * 1000;

const LITTER_STATE = {
  0: 'idle', 1: 'cleaning', 2: 'cat_inside',
  3: 'maintenance', 4: 'paused', 5: 'dumping',
  6: 'resetting', 10: 'error',
};

class PetKitDevice extends Homey.Device {

  async onInit() {
    this.log(`Device ${this.getName()} initializing`);
    this._api = null;
    this._prev = {};

    await this._initAPI();
    await this._poll();
    this._timer = this.homey.setInterval(() => this._poll(), POLL_MS);

    this.log(`Device ${this.getName()} ready`);
  }

  async onDeleted() {
    if (this._timer) this.homey.clearInterval(this._timer);
  }

  // Re-login when settings change (user updated credentials)
  async onSettings({ newSettings }) {
    this._api = null;
    await this._initAPI(newSettings);
  }

  async _initAPI(settings) {
    const s = settings || this.getSettings();
    if (!s.username || !s.password) {
      this.setUnavailable('Ingen påloggingsinfo. Re-par enheten.');
      return;
    }
    this._api = new PetKitAPI({
      email:    s.username,
      password: s.password,
      region:   s.region || 'EU',
    });
    try {
      await this._api.login();
      this.log('API login OK');
    } catch (err) {
      this.error('API login failed:', err.message);
      this.setUnavailable(`Innlogging feilet: ${err.message}`);
    }
  }

  async _poll() {
    if (!this._api || !this._api.token) {
      try { await this._initAPI(); } catch (_) { return; }
    }
    const s   = this.getSettings();
    const cat = s.deviceCategory || 'other';
    const id  = this.getData().id;
    try {
      const status = await this._api.getDeviceStatus(id, cat);
      if (status) await this._update(status, cat);
      this.setAvailable();
    } catch (err) {
      this.error('Poll error:', err.message);
      if (/session|login|token/i.test(err.message)) {
        this._api = null;
      }
    }
  }

  async _update(s, cat) {
    const online = !!(s.state?.pim === 1 || s.online);
    await this._set('alarm_connected', online);

    if (cat === 'litter_box') await this._updateLitter(s);
    if (cat === 'feeder')     await this._updateFeeder(s);
    if (cat === 'fountain')   await this._updateFountain(s);
  }

  async _updateLitter(s) {
    const mode = s.workState?.workMode ?? s.state?.workMode ?? 0;
    const str  = LITTER_STATE[mode] || 'unknown';
    const litter  = s.state?.sandPercent  ?? null;
    const waste   = s.state?.boxState     ?? null;
    const weight  = s.state?.petWeight    ?? null;
    const battery = s.state?.battery      ?? null;

    await this._set('petkit_litter_status', str);
    if (litter  !== null) await this._set('petkit_litter_level', litter);
    if (waste   !== null) await this._set('petkit_waste_bin',    waste);
    if (weight  !== null) await this._set('petkit_cat_weight',   weight / 100);
    if (battery !== null) await this._set('measure_battery',     battery);

    this._trigger('litter_box_cleaning_started',  str === 'cleaning'   && this._prev.litter !== 'cleaning');
    this._trigger('litter_box_cleaning_finished', str === 'idle'       && this._prev.litter === 'cleaning');
    this._trigger('cat_entered_litter_box',       str === 'cat_inside' && this._prev.litter !== 'cat_inside');
    this._trigger('cat_left_litter_box',          str !== 'cat_inside' && this._prev.litter === 'cat_inside');
    this._trigger('waste_bin_full',               waste !== null && waste >= 85 && !this._prev.waste_full);

    this._prev.litter     = str;
    this._prev.waste_full = waste !== null && waste >= 85;
  }

  async _updateFeeder(s) {
    const food    = s.state?.foodStatus   ?? null;
    const disp    = s.state?.todayFeedAmt ?? null;
    const eating  = s.state?.eating === 1;
    const battery = s.state?.battery      ?? null;
    const foodPct = food !== null ? Math.round((food / 2) * 100) : null;

    if (foodPct !== null) await this._set('petkit_food_level',      foodPct);
    if (disp    !== null) await this._set('petkit_dispensed_today', disp);
    await this._set('petkit_eating', eating);
    if (battery !== null) await this._set('measure_battery', battery);

    this._trigger('food_level_low',     food !== null && food <= 1 && !this._prev.food_low);
    this._trigger('pet_started_eating', eating  && !this._prev.eating);
    this._trigger('pet_stopped_eating', !eating &&  this._prev.eating);

    this._prev.eating   = eating;
    this._prev.food_low = food !== null && food <= 1;
  }

  async _updateFountain(s) {
    const water   = s.state?.waterPercent ?? null;
    const battery = s.state?.battery      ?? null;
    if (water   !== null) await this._set('petkit_water_level', water);
    if (battery !== null) await this._set('measure_battery',    battery);
  }

  async _set(cap, val) {
    if (!this.hasCapability(cap) || val === null || val === undefined) return;
    await this.setCapabilityValue(cap, val).catch(e => this.error(`set ${cap}:`, e.message));
  }

  _trigger(id, condition) {
    if (!condition) return;
    this.homey.flow.getDeviceTriggerCard(id).trigger(this, {}).catch(e => this.error('trigger:', e));
  }

  // ── Commands called by Flow actions ──
  async startCleaning()       { await this._api.startCleaning(this.getData().id); }
  async stopCleaning()        { await this._api.stopCleaning(this.getData().id); }
  async odorRemoval()         { await this._api.odorRemoval(this.getData().id); }
  async manualFeed(amount)    {
    const t = Number(this.getSettings().deviceType);
    if (t === 4 || t === 13) await this._api.manualFeedD4(this.getData().id, amount);
    else                     await this._api.manualFeed(this.getData().id, amount);
  }
}

module.exports = PetKitDevice;
