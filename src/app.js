const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const {wildnetHandler} = require('./tunnel-utility.js');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-line global-require
if (require('electron-squirrel-startup')) {
  app.quit();
}
let mainWindow = null;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 800,
    show: false,
    resizable: false,
    icon: path.join(__dirname + "/resources/images/icon512x512.png"),
    webPreferences:{
      enableRemoteModule: true,
      nodeIntegration: true
    }
  });

  //disable the default menu bar
  mainWindow.setMenu(null);
  
  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'login.html'));

  let splashScreenWindown = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname + "/resources/images/icon512x512.png")
  });

  // and load the index.html of the app.
  splashScreenWindown.loadFile(path.join(__dirname, 'splashscreen.html'));
  splashScreenWindown.on("ready-to-show", ()=>{
    autoUpdater.checkForUpdatesAndNotify();
    setTimeout(()=>{
      splashScreenWindown.close();
      mainWindow.show();
      splashScreenWindown = null;
    },5000);
  });

  // Open the DevTools.
  // splashScreenWindown.webContents.openDevTools();
  mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  wildnetHandler.stop(()=>{
    app.quit();
  });
  mainWindow = null;
});
app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if(BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.env.APPIMAGE = path.join(__dirname, 'dist', `pCloudy-App-${app.getVersion()}.AppImage`);