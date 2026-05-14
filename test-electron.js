const { app } = require('electron');
console.log('app:', typeof app);
console.log('app.isPackaged:', app?.isPackaged);
app.whenReady().then(() => {
  console.log('App ready!');
  setTimeout(() => app.quit(), 1000);
});
