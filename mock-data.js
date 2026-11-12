/**
 * Bus Tracker VN - Mock Data
 * Demo bus routes with start/end stations for Ho Chi Minh City and Hanoi.
 * Replace with real API data from your Cloudflare Worker when available.
 */

const MOCK_DATA = {
  hcmc: {
    city: 'hcmc',
    cityName: 'Ho Chi Minh City',
    updatedAt: new Date().toISOString(),
    routes: [
      {
        id: 'hcmc-01',
        number: '01',
        name: 'Bến Thành – Chợ Lớn',
        startStation: 'Bến Thành',
        endStation: 'Chợ Lớn',
        color: '#1976d2',
        stops: [
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
          { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 3 },
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 4 }
        ],
        buses: [
          { id: 'hcmc-01-a', routeId: 'hcmc-01', lat: 10.7720, lng: 106.6780, heading: 90, nextStop: 'Nguyễn Huệ', eta: '3 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-04',
        number: '04',
        name: 'Bến Xe Miền Đông – Chợ Lớn',
        startStation: 'Bến Xe Miền Đông',
        endStation: 'Chợ Lớn',
        color: '#4caf50',
        stops: [
          { name: 'Bến Xe Miền Đông', lat: 10.8100, lng: 106.7100, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7900, lng: 106.6900, seq: 2 },
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-04-a', routeId: 'hcmc-04', lat: 10.7950, lng: 106.6950, heading: 180, nextStop: 'Chợ Lớn', eta: '7 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-15',
        number: '15',
        name: 'Bến Thành – Chợ Rùng',
        startStation: 'Bến Thành',
        endStation: 'Chợ Rùng',
        color: '#ff9800',
        stops: [
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
          { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 2 },
          { name: 'Chợ Rùng', lat: 10.7300, lng: 106.7200, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-15-a', routeId: 'hcmc-15', lat: 10.7600, lng: 106.6900, heading: 45, nextStop: 'Chợ Rùng', eta: '12 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-18',
        number: '18',
        name: 'Chợ Lớn – Bến Xe Miền Tây',
        startStation: 'Chợ Lớn',
        endStation: 'Bến Xe Miền Tây',
        color: '#e91e63',
        stops: [
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
          { name: 'Nguyễn Trọng Trí', lat: 10.7400, lng: 106.6600, seq: 2 },
          { name: 'Bến Xe Miền Tây', lat: 10.7600, lng: 106.6200, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-18-a', routeId: 'hcmc-18', lat: 10.7450, lng: 106.6550, heading: 270, nextStop: 'Bến Xe Miền Tây', eta: '5 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-19',
        number: '19',
        name: 'Chợ Lớn – Bến Thành',
        startStation: 'Chợ Lớn',
        endStation: 'Bến Thành',
        color: '#9c27b0',
        stops: [
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-19-a', routeId: 'hcmc-19', lat: 10.7650, lng: 106.6750, heading: 0, nextStop: 'Điện Biên Phủ', eta: '4 phút', updatedAt: new Date().toISOString() }
        ]
      }
    ]
  },

  hanoi: {
    city: 'hanoi',
    cityName: 'Hanoi',
    updatedAt: new Date().toISOString(),
    routes: [
      {
        id: 'hn-01',
        number: '01',
        name: 'Yên Nghĩa – Long Biên',
        startStation: 'Yên Nghĩa',
        endStation: 'Long Biên',
        color: '#1976d2',
        stops: [
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 3 }
        ],
        buses: [
          { id: 'hn-01-a', routeId: 'hn-01', lat: 21.0100, lng: 105.8100, heading: 90, nextStop: 'Long Biên', eta: '6 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-09',
        number: '09',
        name: 'Long Biên – Yên Nghĩa',
        startStation: 'Long Biên',
        endStation: 'Yên Nghĩa',
        color: '#4caf50',
        stops: [
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 1 },
          { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 2 },
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 3 }
        ],
        buses: [
          { id: 'hn-09-a', routeId: 'hn-09', lat: 21.0300, lng: 105.8400, heading: 180, nextStop: 'Bát Tràng', eta: '8 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-14',
        number: '14',
        name: 'Cầu Giấy – Bát Tràng',
        startStation: 'Cầu Giấy',
        endStation: 'Bát Tràng',
        color: '#ff9800',
        stops: [
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 },
          { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 3 }
        ],
        buses: [
          { id: 'hn-14-a', routeId: 'hn-14', lat: 21.0250, lng: 105.8000, heading: 45, nextStop: 'Long Biên', eta: '10 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-32',
        number: '32',
        name: 'Yên Nghĩa – Bạch Mai',
        startStation: 'Yên Nghĩa',
        endStation: 'Bạch Mai',
        color: '#e91e63',
        stops: [
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
          { name: 'Bạch Mai', lat: 21.0000, lng: 105.8300, seq: 3 }
        ],
        buses: [
          { id: 'hn-32-a', routeId: 'hn-32', lat: 20.9800, lng: 105.8000, heading: 270, nextStop: 'Bạch Mai', eta: '5 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-44',
        number: '44',
        name: 'Cầu Giấy – Long Biên',
        startStation: 'Cầu Giấy',
        endStation: 'Long Biên',
        color: '#9c27b0',
        stops: [
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 }
        ],
        buses: [
          { id: 'hn-44-a', routeId: 'hn-44', lat: 21.0300, lng: 105.8200, heading: 0, nextStop: 'Long Biên', eta: '3 phút', updatedAt: new Date().toISOString() }
        ]
      }
    ]
  }
};

function getMockData(city) {
  return MOCK_DATA[city] || MOCK_DATA.hcmc;
}
