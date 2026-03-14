'use strict';

const Homey = require('homey');
const PetKitAPI = require('../../lib/PetKitAPI');

class PetKitDriver extends Homey.Driver {

  async onInit() {
    this.log('PetKit driver initialized');
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
        return true; // true = success, false = failed
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
