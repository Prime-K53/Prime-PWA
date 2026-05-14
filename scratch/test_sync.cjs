const http = require('http');

const data = JSON.stringify({
  items: [
    {
      id: 'ITEM-001',
      name: 'Paper A4',
      material: 'paper',
      quantity: 100,
      cost: 10
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/examination/sync/inventory-items',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'x-user-id': 'test-user',
    'x-user-role': 'Admin',
    'x-user-is-super-admin': 'true'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
