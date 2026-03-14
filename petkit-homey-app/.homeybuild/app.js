'use strict';

const Homey = require('homey');

class PetKitApp extends Homey.App {

  async onInit() {
    this.log('PetKit app initialized');
  }

}

module.exports = PetKitApp;
