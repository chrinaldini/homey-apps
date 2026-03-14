'use strict';

const Homey = require('homey');

class PetKitApp extends Homey.App {

  async onInit() {
    this.log('PetKit app is initializing...');

    // Register Flow action cards
    this._registerFlowActions();
    this._registerFlowTriggers();
    this._registerFlowConditions();

    this.log('PetKit app initialized successfully');
  }

  _registerFlowActions() {
    // Start cleaning
    this.homey.flow.getActionCard('start_cleaning')
      .registerRunListener(async ({ device }) => {
        return device.startCleaning();
      });

    // Stop cleaning
    this.homey.flow.getActionCard('stop_cleaning')
      .registerRunListener(async ({ device }) => {
        return device.stopCleaning();
      });

    // Odor removal
    this.homey.flow.getActionCard('odor_removal')
      .registerRunListener(async ({ device }) => {
        return device.odorRemoval();
      });

    // Manual feed
    this.homey.flow.getActionCard('manual_feed')
      .registerRunListener(async ({ device, amount }) => {
        return device.manualFeed(amount);
      });

    // Toggle light
    this.homey.flow.getActionCard('toggle_light')
      .registerRunListener(async ({ device }) => {
        return device.toggleLight();
      });
  }

  _registerFlowTriggers() {
    // Triggers are fired from within each device via this.homey.flow.getDeviceTriggerCard(id).trigger(device, tokens)
    // We just register them here so they're available
    this._triggerDeviceOnlineChanged     = this.homey.flow.getDeviceTriggerCard('device_online_changed');
    this._triggerCleaningStarted         = this.homey.flow.getDeviceTriggerCard('litter_box_cleaning_started');
    this._triggerCleaningFinished        = this.homey.flow.getDeviceTriggerCard('litter_box_cleaning_finished');
    this._triggerCatEntered              = this.homey.flow.getDeviceTriggerCard('cat_entered_litter_box');
    this._triggerCatLeft                 = this.homey.flow.getDeviceTriggerCard('cat_left_litter_box');
    this._triggerWasteBinFull            = this.homey.flow.getDeviceTriggerCard('waste_bin_full');
    this._triggerFoodLevelLow            = this.homey.flow.getDeviceTriggerCard('food_level_low');
    this._triggerPetStartedEating        = this.homey.flow.getDeviceTriggerCard('pet_started_eating');
    this._triggerPetStoppedEating        = this.homey.flow.getDeviceTriggerCard('pet_stopped_eating');
  }

  _registerFlowConditions() {
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
  }

}

module.exports = PetKitApp;
