const QRCode = require('qrcode');

QRCode.toFile('qr.png', 'https://primeprinting.example.com/verify/INV-1806', {
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
}, function (err) {
  if (err) throw err;
  console.log('QR code generated successfully as qr.png');
});
