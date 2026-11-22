/**
 * Bus Tracker VN - Simple Widget View
 * Simple iframe wrapper around BusMaps widget
 */

(() => {
  'use strict';

  const iframe = document.getElementById('busmaps-iframe');

  // Set widget URL with city center
  const cityCenters = {
    hcmc: { lat: 10.8231, lng: 106.6297, zoom: 13 },
    hanoi: { lat: 21.0285, lng: 105.8542, zoom: 13 }
  };

  const city = 'hcmc'; // Default city
  const center = cityCenters[city];
  const widgetUrl = `https://busmaps.com/en/maps?lat=${center.lat}&lng=${center.lng}&zoom=${center.zoom}`;

    const url = `https://busmaps.com/en/maps?lat=${center.lat}&lng=${center.lng}&zoom=${center.zoom}`;
    iframe.src = url;
})();