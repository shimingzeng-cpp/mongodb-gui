const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

const menuTemplate = [
  {
    label: '文件',
    submenu: [
      { label: '新建连接', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new-connection') },
      { type: 'separator' },
      { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
    ],
  },
  {
    label: '编辑',
    submenu: [
      { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
    ],
  },
  {
    label: '视图',
    submenu: [
      { label: '刷新', accelerator: 'CmdOrCtrl+R', role: 'reload' },
      { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      { type: 'separator' },
      { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    ],
  },
  {
    label: '窗口',
    submenu: [
      { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
    ],
  },
  {
    label: '帮助',
    submenu: [
      { label: '关于 MongoDB GUI', click: () => {
        const { dialog } = require('electron');
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '关于',
          message: 'MongoDB GUI v1.0',
          detail: '本地 MongoDB 桌面管理工具',
        });
      }},
    ],
  },
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '国产开源MongoDB可视化工具',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 设置菜单栏
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});