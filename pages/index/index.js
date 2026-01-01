// pages/index/index.js
const locales = require('../../utils/locales.js');

Page({
  data: {
    curLang: 'zh',
    t: locales.TRANS['zh'], // 默认加载
    isConnected: false, isScanning: false, isConnecting: false, devices: [],
    connectedDeviceId: '', serviceId: '', characteristicId: '', connectedName: '', inputText: '',
    isJoystickMode: false, stickX: 0, stickY: 0, joystickRadius: 0, centerX: 0, centerY: 0,
    lastSendTime: 0, speed: 5,
    logList: [], scrollTop: 0, 
    isVideoMode: false, videoLoading: false, socketTask: null,
    camAngleLR: 0, camAngleUD: 0, isRecording: false, isAI: false, isTRK: false
  },
  canvasNode: null, canvasCtx: null, socketTask: null, camTimer: null,

  onLoad: function () {
    // 1. 加载语言包 (使用新 API getAppBaseInfo)
    try {
      // 【修改】替换 getSystemInfoSync
      const baseInfo = wx.getAppBaseInfo(); 
      const sysLang = baseInfo.language.toLowerCase();
      const lang = sysLang.includes('en') ? 'en' : 'zh';
      this.setData({
        curLang: lang,
        t: locales.TRANS[lang] 
      });
      wx.setNavigationBarTitle({ title: locales.TRANS[lang].title });
    } catch (e) {
      console.log(e);
    }
    // 2. 计算视频窗口位置 (使用新 API getWindowInfo)
    try {
      // 【修改】替换 getSystemInfoSync
      const windowInfo = wx.getWindowInfo();
      const w = windowInfo.windowWidth;
      const h = windowInfo.windowHeight;
      const vW = (320 / 750) * w, vH = (240 / 750) * w; 
      this.setData({ videoX: (w - vW) / 2, videoY: (h - vH) / 2 - 80 });
    } catch (e) { console.error("尺寸计算失败", e); }

    // 3. 蓝牙初始化
    wx.openBluetoothAdapter({ fail: (e) => console.log(this.data.t.ble_off, e) });
  },

  toggleLang() {
    const newLang = this.data.curLang === 'zh' ? 'en' : 'zh';
    this.setData({ curLang: newLang, t: locales.TRANS[newLang] });
    wx.vibrateShort();
    wx.setNavigationBarTitle({ title: locales.TRANS[newLang].title });
  },

  addLog(msg, type = 'sys') {
    const time = new Date().toTimeString().split(' ')[0];
    let list = this.data.logList;
    if (list.length > 50) list.shift();
    list.push({ time, type, msg });
    this.setData({ logList: list, scrollTop: list.length * 100 });
  },

  sendData(str) {
    this.addLog(`Tx> ${str}`, 'tx');
    if (this.data.connectedDeviceId === 'DEBUG' || !this.data.isConnected) return;
    const s = str + '\n', buf = new ArrayBuffer(s.length), v = new DataView(buf);
    for (let i = 0; i < s.length; i++) v.setUint8(i, s.charCodeAt(i));
    wx.writeBLECharacteristicValue({
      deviceId: this.data.connectedDeviceId, serviceId: this.data.serviceId,
      characteristicId: this.data.characteristicId, value: buf,
      fail: (e) => this.addLog(`Err: ${e.errMsg}`, 'sys')
    });
  },

  getCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId, serviceId,
      success: (res) => {
        const c = res.characteristics.find(i => i.uuid.toUpperCase().includes('FFE1'));
        if (c) { 
          this.setData({ characteristicId: c.uuid, isConnected: true }); 
          wx.hideLoading(); 
          // 【修改】连接成功提示
          this.addLog(this.data.t.conn_ok, 'sys');
          
          setTimeout(() => {
            wx.notifyBLECharacteristicValueChange({
              state: true, deviceId, serviceId, characteristicId: c.uuid,
              // 【修改】监听相关提示
              success: () => { this.addLog(this.data.t.listen_on, 'sys'); this.startListenMsg(); },
              fail: (e) => this.addLog(`${this.data.t.listen_fail}: ${e.errMsg}`, 'sys')
            });
          }, 500);
        }
      }
    });
  },
  startListenMsg() {
    wx.onBLECharacteristicValueChange((res) => {
      const str = this.ab2str(res.value);
      if (str) this.addLog(`Rx< ${str}`, 'rx');
    });
  },
  ab2str(buffer) {
    let str = "", v = new DataView(buffer);
    for (let i = 0; i < v.byteLength; i++) str += String.fromCharCode(v.getUint8(i));
    return str.replace(/\n|\r/g, "");
  },

  handleBtnPress(e) { if(this.data.isConnected) this.sendData(`# ${e.currentTarget.dataset.char.toUpperCase()}`); },
  handleBtnRelease(e) { if(this.data.isConnected) this.sendData(`# ${e.currentTarget.dataset.char.toLowerCase()}`); },
  sendInputCmd() { if(this.data.inputText) this.sendData(this.data.inputText); },
  handleSpeedChange(e) { this.setData({speed: e.detail.value}); this.sendData(`: SPD ${e.detail.value}`); },
  handleInput(e) { this.setData({ inputText: e.detail.value }); },

  toggleMode() {
    const js = !this.data.isJoystickMode;
    this.setData({ isJoystickMode: js });
    this.sendData(js ? ": SM JS" : ": SM BT");
    if (js) setTimeout(() => this.initJoystick(), 200);
  },

  stickMove(e) {
    if (!this.data.isConnected) return;
    const t = e.touches[0];
    let dx = t.pageX - this.data.centerX, dy = t.pageY - this.data.centerY;
    const dist = Math.sqrt(dx*dx + dy*dy), max = this.data.joystickRadius;
    if (dist > max) { const a = Math.atan2(dy, dx); dx = Math.cos(a)*max; dy = Math.sin(a)*max; }
    
    this.setData({ stickX: dx, stickY: dy });
    const now = Date.now();
    if (now - this.data.lastSendTime > 100) {
      this.sendData(`: V ${(dx/max).toFixed(4)} ${(-dy/max).toFixed(4)}`);
      this.data.lastSendTime = now;
    }
  },
  stickEnd() { this.setData({stickX:0, stickY:0}); this.sendData(": V 0.0000 0.0000"); },
  initJoystick() {
    wx.createSelectorQuery().select('#joystick-bg').boundingClientRect(res => {
      if (res) this.setData({ centerX: res.left + res.width/2, centerY: res.top + res.height/2, joystickRadius: res.width/2 - 20 });
    }).exec();
  },
  stickStart(e) { this.stickMove(e); },

  enterDebugMode() {
    // 【修改】调试模式名称和日志
    this.setData({ isConnected: true, connectedName: this.data.t.debug_name, connectedDeviceId: 'DEBUG', isScanning: false });
    this.addLog(this.data.t.debug_start); 
    wx.stopBluetoothDevicesDiscovery();
    setTimeout(() => { if(this.data.isJoystickMode) this.initJoystick(); }, 200);
  },
  startScan() {
    this.setData({ isScanning: true, devices: [], logList: [] });
    wx.closeBluetoothAdapter({ complete: () => setTimeout(() => this.initBluetooth(), 200) });
  },
  initBluetooth() {
    wx.openBluetoothAdapter({
      success: () => this.startDiscovery(),
      // 【修改】蓝牙未开启提示
      fail: () => { this.setData({isScanning:false}); wx.showToast({title: this.data.t.ble_off, icon:'none'}); }
    });
  },
  startDiscovery() {
    wx.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false, success: () => {
      wx.onBluetoothDeviceFound(res => {
        res.devices.forEach(d => {
          if (d.name && d.name.trim() && !this.data.devices.some(x => x.deviceId === d.deviceId)) {
            this.setData({ devices: [...this.data.devices, d] });
          }
        });
      });
    }});
  },
  connectDevice(e) {
    if (this.data.isConnecting) return;
    const { id, name } = e.currentTarget.dataset;
    this.setData({ isConnecting: true }); wx.stopBluetoothDevicesDiscovery(); 
    wx.showLoading({title: this.data.t.connect});
    wx.createBLEConnection({
      deviceId: id, timeout: 10000,
      success: () => { this.setData({connectedDeviceId: id, connectedName: name, isConnecting: false}); this.getServices(id); },
      // 【修改】连接失败提示
      fail: (e) => { wx.hideLoading(); this.setData({isConnecting:false}); this.addLog(`${this.data.t.conn_fail}: ${e.errMsg}`); }
    });
  },
  getServices(deviceId) {
    wx.getBLEDeviceServices({ deviceId, success: (res) => {
      const s = res.services.find(i => i.uuid.toUpperCase().includes('FFE0'));
      if (s) { this.setData({serviceId: s.uuid}); this.getCharacteristics(deviceId, s.uuid); }
    }});
  },
  disconnect() {
    if (this.data.connectedDeviceId && this.data.connectedDeviceId!=='DEBUG') wx.closeBLEConnection({deviceId: this.data.connectedDeviceId});
    this.setData({isConnected:false, devices:[], isConnecting:false});
  },

  openCamera() {
    const url = 'ws://192.168.137.177:8765';
    // 【修改】弹窗标题
    wx.showModal({ title: this.data.t.cam_title, content:url, editable:true, success:(res)=>{
      if(res.confirm) this.startWebSocket(res.content || url);
    }});
  },
  startWebSocket(url) {
    this.setData({ isVideoMode: true, videoLoading: true });
    setTimeout(() => { this.initCanvas().then(() => this.connectSocket(url)); }, 200);
  },
  initCanvas() {
    return new Promise(resolve => {
      wx.createSelectorQuery().select('#videoCanvas').fields({node:true, size:true}).exec(res => {
        if (!res[0] || !res[0].node) return;
        const cvs = res[0].node;
        const ctx = cvs.getContext('2d');
        // 【修改】替换 getSystemInfoSync
        const windowInfo = wx.getWindowInfo();
        const dpr = windowInfo.pixelRatio;
        cvs.width = res[0].width * dpr; 
        cvs.height = res[0].height * dpr; 
        ctx.scale(dpr, dpr);
        this.canvasNode = cvs; 
        this.canvasCtx = ctx; 
        this.canvasWidth = res[0].width; 
        this.canvasHeight = res[0].height;
        resolve();
      });
    });
  },
  connectSocket(url) {
    this.socketTask = wx.connectSocket({
      url: url,
      success: () => console.log('WS 连接发起')
    });
    this.socketTask.onMessage((res) => {
      const data = res.data;
      if (typeof data === 'string' && data.startsWith("PHOTO:")) {
        const base64Data = data.replace("PHOTO:", "");
        this.saveBase64ImageToAlbum(base64Data);
      } 
      else if (this.canvasNode && this.canvasCtx) {
        const img = this.canvasNode.createImage();
        img.onload = () => {
          this.canvasCtx.drawImage(img, 0, 0, this.canvasWidth, this.canvasHeight);
        };
        img.src = data.startsWith('data:image') ? data : 'data:image/jpeg;base64,' + data;
      }
    });
    this.socketTask.onOpen(() => { console.log('WS连上'); this.setData({videoLoading: false}); });
    this.socketTask.onError((e) => { console.error('WS Err', e); this.closeCamera(); wx.showToast({title: this.data.t.disconnect, icon:'none'}); });
  },
  closeCamera() {
    if (this.socketTask) {
      this.socketTask.close({ code: 1000, reason: 'User', fail: ()=>{} });
      this.socketTask = null;
    }
    this.setData({ isVideoMode: false });
    this.canvasNode = null; this.canvasCtx = null;
  },

  startCamMove(e) {
    if (!this.data.isConnected && this.data.connectedDeviceId !== 'DEBUG') return;
    const dir = e.currentTarget.dataset.dir;
    this.updateCamAngle(dir);
    this.camTimer = setInterval(() => this.updateCamAngle(dir), 100);
  },
  stopCamMove() { if(this.camTimer) { clearInterval(this.camTimer); this.camTimer = null; } },
  updateCamAngle(dir) {
    let { camAngleLR: lr, camAngleUD: ud } = this.data, step = 3;
    if (dir === 'L') lr -= step; else if (dir === 'R') lr += step;
    else if (dir === 'U') ud += step; else if (dir === 'D') ud -= step;
    lr = Math.max(-90, Math.min(90, lr)); ud = Math.max(-90, Math.min(90, ud));
    if ((['L','R'].includes(dir) && lr !== this.data.camAngleLR)) {
      this.setData({ camAngleLR: lr }); this.sendData(`: SVO LR ${lr}`);
    } else if ((['U','D'].includes(dir) && ud !== this.data.camAngleUD)) {
      this.setData({ camAngleUD: ud }); this.sendData(`: SVO UD ${ud}`);
    }
  },
  saveBase64ImageToAlbum(base64Data) {
    const fs = wx.getFileSystemManager();
    const times = new Date().getTime();
    const filePath = `${wx.env.USER_DATA_PATH}/${times}.png`;

    fs.writeFile({
      filePath: filePath, data: base64Data, encoding: 'base64',
      success: () => {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
            wx.showToast({ title: this.data.t.save_ok, icon: 'success' });
            fs.unlink({ filePath: filePath });
          },
          fail: (err) => {
            console.error(err);
            if (err.errMsg.includes("auth deny")) {
              // 【修改】权限提示
              wx.showModal({
                title: this.data.t.auth_title,
                content: this.data.t.auth_msg,
                success: (res) => { if (res.confirm) wx.openSetting(); }
              });
            } else {
              wx.showToast({ title: this.data.t.save_fail, icon: 'none' });
            }
          }
        });
      },
      fail: (err) => { console.error("写入临时文件失败", err); }
    });
  },
  
  takePhoto() { this.sendData(": CAM SHOT"); wx.vibrateShort(); wx.showToast({title: this.data.t.shot, icon:'none'}); },
  toggleRecord() {
    const r = !this.data.isRecording;
    this.setData({ isRecording: r }); 
    this.sendData(r ? ": CAM REC" : ": CAM END");
    wx.showToast({ title: r ? this.data.t.rec_start : this.data.t.rec_end, icon:'none' });
  },
  toggleAI() { const s = !this.data.isAI; this.setData({ isAI: s }); this.sendData(s ? ": AI 1" : ": AI 0"); wx.vibrateShort(); },
  toggleTRK() { const s = !this.data.isTRK; this.setData({ isTRK: s }); this.sendData(s ? ": TRK 1" : ": TRK 0"); wx.vibrateShort(); }
});