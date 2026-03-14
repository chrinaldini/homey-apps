'use strict';

const Homey = require('homey');
const PetKitAPI = require('../../lib/PetKitAPI');

class PetKitDriver extends Homey.Driver {

  async onInit() {
    this.log('PetKit driver initialized');

    // Actions
    this.homey.flow.getActionCard('start_cleaning')
      .registerRunListener(async ({ device }) => device.startCleaning());

    this.homey.flow.getActionCard('stop_cleaning')
      .registerRunListener(async ({ device }) => device.stopCleaning());

    this.homey.flow.getActionCard('odor_removal')
      .registerRunListener(async ({ device }) => device.odorRemoval());

    this.homey.flow.getActionCard('toggle_light')
      .registerRunListener(async ({ device }) => device.toggleLight());

    this.homey.flow.getActionCard('manual_feed')
      .registerRunListener(async ({ device, amount }) => device.manualFeed(amount));

    // Conditions
    this.homey.flow.getConditionCard('device_is_online')
      .registerRunListener(async ({ device }) => {
        return device.getCapabilityValue('alarm_connected') === true;
      });

    this.homey.flow.getConditionCard('litter_box_is_clean')
      .registerRunListener(async ({ device }) => {
        return device.getCapabilityValue('petkit_litter_status') === 'idle';
      });

    this.homey.flow.getConditionCard('feeder_has_food')
      .registerRunListener(async ({ device }) => {
        const level = device.getCapabilityValue('petkit_food_level');
        return level !== null && level > 0;
      });

    // Store trigger card references for use by devices
    this.triggerDeviceOnlineChanged    = this.homey.flow.getDeviceTriggerCard('device_online_changed');
    this.triggerCleaningStarted        = this.homey.flow.getDeviceTriggerCard('litter_box_cleaning_started');
    this.triggerCleaningFinished       = this.homey.flow.getDeviceTriggerCard('litter_box_cleaning_finished');
    this.triggerCatEntered             = this.homey.flow.getDeviceTriggerCard('cat_entered_litter_box');
    this.triggerCatLeft                = this.homey.flow.getDeviceTriggerCard('cat_left_litter_box');
    this.triggerWasteBinFull           = this.homey.flow.getDeviceTriggerCard('waste_bin_full');
    this.triggerFoodLevelLow           = this.homey.flow.getDeviceTriggerCard('food_level_low');
    this.triggerPetStartedEating       = this.homey.flow.getDeviceTriggerCard('pet_started_eating');
    this.triggerPetStoppedEating       = this.homey.flow.getDeviceTriggerCard('pet_stopped_eating');
  }

  async onPair(session) {
    let username = '';
    let password = '';
    let region   = 'EU';

    // Called by the custom select_region view
    session.setHandler('select_region', async ({ region: r }) => {
      region = r || 'EU';
      this.log(`Pairing: region selected = ${region}`);
    });

    // Called automatically by the login_credentials template
    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      this.log(`Pairing: login attempt for ${username} region=${region}`);

      const api = new PetKitAPI({ email: username, password, region });
      try {
        await api.login();
        this._api = api;
        this.log('Pairing: login OK');
        return true;
      } catch (err) {
        this.error('Pairing: login failed:', err.message);
        throw new Error(err.message || 'Innlogging feilet');
      }
    });

    // Called automatically by the list_devices template
    session.setHandler('list_devices', async () => {
      if (!this._api) throw new Error('Ikke innlogget');

      this.log('Pairing: fetching device list');
      const devices = await this._api.getDevices();
      this.log(`Pairing: found ${devices.length} device(s)`);

      return devices.map(d => ({
        name: `${d.name} (${d.typeName})`,
        data: { id: d.id },
        settings: {
          username,
          password,
          region,
          deviceCategory: d.category,
          deviceType:     String(d.type),
        },
        capabilities: PetKitDriver._capsForCategory(d.category),
      }));
    });
  }

  static _capsForCategory(cat) {
    const base = ['alarm_connected'];
    if (cat === 'litter_box') return [...base, 'petkit_litter_status', 'petkit_litter_level', 'petkit_waste_bin', 'petkit_cat_weight', 'measure_battery'];
    if (cat === 'feeder')     return [...base, 'petkit_food_level', 'petkit_dispensed_today', 'petkit_eating', 'measure_battery'];
    if (cat === 'fountain')   return [...base, 'petkit_water_level', 'measure_battery'];
    return base;
  }
}

module.exports = PetKitDriver;
