// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';
var Promise = require('bluebird');
var deviceSdk = require('azure-iot-device');
var debug = require('debug')('e2etests:testsUtils');

function createDeviceClient(deviceTransport, provisionedDevice) {
  var deviceClient;
  if (provisionedDevice.hasOwnProperty('primaryKey')) {
    deviceClient = deviceSdk.Client.fromConnectionString(provisionedDevice.connectionString, deviceTransport);
  } else if (provisionedDevice.hasOwnProperty('certificate')) {
    deviceClient = deviceSdk.Client.fromConnectionString(provisionedDevice.connectionString, deviceTransport);
    var options = {
      cert: provisionedDevice.certificate,
      key: provisionedDevice.clientKey,
    };
    deviceClient.setOptions(options);
    // due to some clock skew, it is possible that the certificate is not valid yet using the IoT hub clock
    // since the pem module does not offer the possibility to set the NotBefore field, we have to resort to retrying.
    // https://github.com/Dexus/pem/issues/30
    deviceClient._retryPolicy._errorFilter.UnauthorizedError = true;
    deviceClient._maxOperationTimeout = 30000; // retry for at most 30 seconds, we don't want the test to take too long.
  } else {
    deviceClient = deviceSdk.Client.fromSharedAccessSignature(provisionedDevice.connectionString, deviceTransport);
  }
  return deviceClient;
}

function closeDeviceServiceClients(deviceClient, serviceClient, done) {
  var serviceErr = null;
  var deviceErr = null;
  debug('closing service client...');
  serviceClient.close(function (err) {
    if (err) {
      debug('error closing the service client: ' + err.toString());
    } else {
      debug('service client closed');
    }
    serviceErr = err || deviceErr;
    serviceClient = null;
    if (serviceErr || !deviceClient) {
      debug('service client close and no device client. calling the callback');
      done(serviceErr);
    }
  });
  debug('closing the device client...');
  deviceClient.close(function (err) {
    if (err) {
      debug('error closing the device client: ' + err.toString());
    } else {
      debug('device client closed');
    }
    deviceErr = err || serviceErr;
    deviceClient = null;
    if (deviceErr || !serviceClient) {
      debug('device client closed and no service client. calling the callback');
      done(deviceErr);
    }
  });
}

function closeDeviceEventHubClients(deviceClient, eventHubClient, ehReceivers, done) {
  var eventHubErr = null;
  var deviceErr = null;
  debug('closing the event hubs receivers...');
  Promise.map(ehReceivers, function (recvToClose) {
    debug('closing receiver...');
    recvToClose.removeAllListeners();
    return recvToClose.close();
  }).then(function () {
    debug('receivers closed. closing event hubs client...');
    return eventHubClient.close();
  }).then(function () {
    debug('event hubs client closed.');
    eventHubErr = deviceErr;
    eventHubClient = null;
    if (!deviceClient) {
      debug('event hubs client closed and no device client. calling the callback');
      done(eventHubErr);
    }
  }).catch(function (err) {
    eventHubErr = err;
    eventHubClient = null;
    if (!deviceClient) {
      debug('error closing event hubs client: ' + eventHubErr.toString());
      debug('calling callback with the error');
      done(eventHubErr);
    }
  });
  debug('closing device client...');
  deviceClient.close(function (err) {
    if (err) {
      debug('error closing the device client: ' + err.toString());
    } else {
      debug('device client closed');
    }
    deviceErr = err || eventHubErr;
    deviceClient = null;
    if (deviceErr || !eventHubClient) {
      debug('device client closed and no event hubs client. calling the callback');
      done(deviceErr);
    }
  });
}

module.exports = {
  createDeviceClient: createDeviceClient,
  closeDeviceServiceClients: closeDeviceServiceClients,
  closeDeviceEventHubClients: closeDeviceEventHubClients
};
