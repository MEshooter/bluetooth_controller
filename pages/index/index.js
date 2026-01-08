// pages/index/index.js
const locales = require('../../utils/locales.js');

Page({
  data: {
    curLang: 'zh', t: locales.TRANS['zh'],
    isConnected: false, isScanning: false, isConnecting: false, devices: [],
    connectedDeviceId: '', serviceId: '', characteristicId: '', connectedName: '',
    inputText: '', isJoystickMode: false, 
    stickX: 0, stickY: 0, joystickRadius: 0, centerX: 0, centerY: 0,
    lastSendTime: 0, speed: 5, logList: [], scrollTop: 0,
    isVideoMode: false, videoLoading: false, 
    camAngleLR: 0, camAngleUD: 0, isRecording: false, isAI: false, isTRK: false
  },
  
  // Instance variables
  canvasNode: null, canvasCtx: null, socketTask: null, camTimer: null,

  onLoad() {
    // 1. Load Language (Using new API)
    try {
      const sysLang = wx.getAppBaseInfo().language.toLowerCase();
      const lang = sysLang.includes('en') ? 'en' : 'zh';
      this.setData({ curLang: lang, t: locales.TRANS[lang] });
      wx.setNavigationBarTitle({ title: locales.TRANS[lang].title });
    } catch (e) { console.error("Lang Init Error:", e); }

    // 2. Calculate Video Window Size
    try {
      const win = wx.getWindowInfo();
      const vW = (320 / 750) * win.windowWidth, vH = (240 / 750) * win.windowWidth;
      this.setData({ videoX: (win.windowWidth - vW) / 2, videoY: (win.windowHeight - vH) / 2 - 80 });
    } catch (e) { console.error("Size Calc Error:", e); }

    // 3. Init Bluetooth
    wx.openBluetoothAdapter({ fail: (e) => console.log("BLE Init Fail:", e) });
  },

  toggleLang() {
    const newLang = this.data.curLang === 'zh' ? 'en' : 'zh';
    this.setData({ curLang: newLang, t: locales.TRANS[newLang] });
    wx.vibrateShort();
    wx.setNavigationBarTitle({ title: locales.TRANS[newLang].title });
  },

  addLog(msg, type = 'sys') {
    const list = this.data.logList;
    if (list.length > 50) list.shift();
    list.push({ time: new Date().toTimeString().split(' ')[0], type, msg });
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

  // --- Bluetooth Logic ---
  startScan() {
    this.setData({ isScanning: true, devices: [], logList: [] });
    wx.closeBluetoothAdapter({ complete: () => setTimeout(this.initBluetooth, 200) });
  },
  initBluetooth() {
    wx.openBluetoothAdapter({
      success: () => this.startDiscovery(),
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
      fail: (e) => { wx.hideLoading(); this.setData({isConnecting:false}); this.addLog(`${this.data.t.conn_fail}: ${e.errMsg}`); }
    });
  },
  getServices(devId) {
    wx.getBLEDeviceServices({ deviceId: devId, success: (res) => {
      const s = res.services.find(i => i.uuid.toUpperCase().includes('FFE0'));
      if (s) { this.setData({serviceId: s.uuid}); this.getCharacteristics(devId, s.uuid); }
    }});
  },
  getCharacteristics(devId, svcId) {
    wx.getBLEDeviceCharacteristics({
      deviceId: devId, serviceId: svcId,
      success: (res) => {
        const c = res.characteristics.find(i => i.uuid.toUpperCase().includes('FFE1'));
        if (c) { 
          this.setData({ characteristicId: c.uuid, isConnected: true }); 
          wx.hideLoading(); 
          this.addLog(this.data.t.conn_ok, 'sys');
          setTimeout(() => {
            wx.notifyBLECharacteristicValueChange({
              state: true, deviceId: devId, serviceId: svcId, characteristicId: c.uuid,
              success: () => { this.addLog(this.data.t.listen_on, 'sys'); this.startRx(); },
              fail: (e) => this.addLog(`${this.data.t.listen_fail}: ${e.errMsg}`, 'sys')
            });
          }, 500);
        }
      }
    });
  },
  startRx() {
    wx.onBLECharacteristicValueChange((res) => {
      let str = "", v = new DataView(res.value);
      for (let i = 0; i < v.byteLength; i++) str += String.fromCharCode(v.getUint8(i));
      this.addLog(`Rx< ${str.replace(/\n|\r/g, "")}`, 'rx');
    });
  },
  disconnect() {
    if (this.data.connectedDeviceId && this.data.connectedDeviceId!=='DEBUG') 
      wx.closeBLEConnection({deviceId: this.data.connectedDeviceId});
    this.setData({isConnected:false, devices:[], isConnecting:false});
  },

  // --- Input & Control ---
  handleBtnPress(e) { if(this.data.isConnected) this.sendData(`# ${e.currentTarget.dataset.char.toUpperCase()}`); },
  handleBtnRelease(e) { if(this.data.isConnected) this.sendData(`# ${e.currentTarget.dataset.char.toLowerCase()}`); },
  sendInputCmd() { if(this.data.inputText) this.sendData(this.data.inputText); },
  handleSpeedChange(e) { this.setData({speed: e.detail.value}); this.sendData(`: SPD ${e.detail.value}`); },
  handleInput(e) { this.setData({ inputText: e.detail.value }); },
  enterDebugMode() {
    this.setData({ isConnected: true, connectedName: this.data.t.debug_name, connectedDeviceId: 'DEBUG', isScanning: false });
    this.addLog(this.data.t.debug_start); wx.stopBluetoothDevicesDiscovery();
    setTimeout(() => { if(this.data.isJoystickMode) this.initJoystick(); }, 200);
  },

  // --- Joystick Logic ---
  toggleMode() {
    const js = !this.data.isJoystickMode;
    this.setData({ isJoystickMode: js });
    this.sendData(js ? ": SM JS" : ": SM BT");
    if (js) setTimeout(this.initJoystick, 200);
  },
  initJoystick() {
    wx.createSelectorQuery().select('#joystick-bg').boundingClientRect(res => {
      if (res) this.setData({ centerX: res.left + res.width/2, centerY: res.top + res.height/2, joystickRadius: res.width/2 - 20 });
    }).exec();
  },
  stickStart(e) { this.stickMove(e); },
  stickMove(e) {
    if (!this.data.isConnected) return;
    const t = e.touches[0];
    let dx = t.pageX - this.data.centerX, dy = t.pageY - this.data.centerY;
    const dist = Math.sqrt(dx*dx + dy*dy), max = this.data.joystickRadius;
    if (dist > max) { const a = Math.atan2(dy, dx); dx = Math.cos(a)*max; dy = Math.sin(a)*max; }
    
    this.setData({ stickX: dx, stickY: dy });
    if (Date.now() - this.data.lastSendTime > 100) {
      this.sendData(`: V ${(dx/max).toFixed(4)} ${(-dy/max).toFixed(4)}`);
      this.data.lastSendTime = Date.now();
    }
  },
  stickEnd() { this.setData({stickX:0, stickY:0}); this.sendData(": V 0.0000 0.0000"); },

  // --- Camera & WebSocket ---
  openCamera() {
    const url = 'ws://192.168.137.178:8765';
    wx.showModal({ title: this.data.t.cam_title, content: url, editable: true, success: (res) => {
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
        const cvs = res[0].node, ctx = cvs.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        cvs.width = res[0].width * dpr; cvs.height = res[0].height * dpr; ctx.scale(dpr, dpr);
        this.canvasNode = cvs; this.canvasCtx = ctx; 
        this.canvasWidth = res[0].width; this.canvasHeight = res[0].height;
        resolve();
      });
    });
  },
  connectSocket(url) {
    this.socketTask = wx.connectSocket({ url, success: () => console.log('WS Init') });
    this.socketTask.onOpen(() => { console.log('WS Connected'); this.setData({videoLoading: false}); });
    this.socketTask.onError((e) => { console.error('WS Error', e); this.closeCamera(); wx.showToast({title: this.data.t.disconnect, icon:'none'}); });
    
    this.socketTask.onMessage((res) => {
      const data = res.data;
      // 1. Photo Handling with robust cleaning
      if (typeof data === 'string' && data.startsWith("PHOTO:")) {
        const base64Data = data.replace("PHOTO:", "").replace(/[\r\n\s]/g, "");
        console.log("Photo received, size:", base64Data.length);
        this.saveBase64ImageToAlbum(base64Data);
      } 
      // 2. Video Stream Handling
      else if (this.canvasNode && this.canvasCtx) {
        const img = this.canvasNode.createImage();
        img.onload = () => { if (this.canvasCtx) this.canvasCtx.drawImage(img, 0, 0, this.canvasWidth, this.canvasHeight); };
        img.src = data.startsWith('data:image') ? data : 'data:image/jpeg;base64,' + data;
      }
    });
  },
  closeCamera() {
    if (this.socketTask) { this.socketTask.close({ code: 1000, reason: 'User' }); this.socketTask = null; }
    this.setData({ isVideoMode: false }); this.canvasNode = null; this.canvasCtx = null;
  },

  // --- PTZ & Camera Features ---
  startCamMove(e) {
    if (!this.data.isConnected && this.data.connectedDeviceId !== 'DEBUG') return;
    const dir = e.currentTarget.dataset.dir;
    this.updateCamAngle(dir);
    this.camTimer = setInterval(() => this.updateCamAngle(dir), 50);
  },
  stopCamMove() { if(this.camTimer) { clearInterval(this.camTimer); this.camTimer = null; } },
  updateCamAngle(dir) {
    let { camAngleLR: lr, camAngleUD: ud } = this.data, step = 1;
    if (dir === 'L') lr -= step; else if (dir === 'R') lr += step;
    else if (dir === 'U') ud += step; else if (dir === 'D') ud -= step;

    lr = Math.max(-90, Math.min(90, lr)); ud = Math.max(-60, Math.min(90, ud));

    // CRITICAL: Send negated values (-lr, -ud) as per logic requirements
    if (['L','R'].includes(dir) && lr !== this.data.camAngleLR) {
      this.setData({ camAngleLR: lr }); this.sendData(`: SVO LR ${-lr}`);
    } else if (['U','D'].includes(dir) && ud !== this.data.camAngleUD) {
      this.setData({ camAngleUD: ud }); this.sendData(`: SVO UD ${-ud}`);
    }
  },

  saveBase64ImageToAlbum(base64Data) {
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/${Date.now()}.jpg`; // Must use .jpg

    console.log("Writing temp file:", filePath);
    fs.writeFile({
      filePath, data: base64Data, encoding: 'base64',
      success: () => {
        console.log("Write success, saving to album...");
        wx.saveImageToPhotosAlbum({
          filePath,
          success: () => {
            wx.showToast({ title: this.data.t.save_ok || 'Saved', icon: 'success' });
            fs.unlink({ filePath, fail: (e) => console.log('Del temp fail', e) });
          },
          fail: (err) => {
            console.error("Album save failed:", err);
            if (err.errMsg && (err.errMsg.includes("auth deny") || err.errMsg.includes("authorize:fail"))) {
              wx.showModal({
                title: this.data.t.auth_title || 'Auth Denied',
                content: this.data.t.auth_msg || 'Please enable album permissions in settings.',
                success: (res) => { if (res.confirm) wx.openSetting(); }
              });
            } else {
              wx.showToast({ title: `${this.data.t.save_fail || 'Failed'}: ${err.errMsg}`, icon: 'none' });
            }
          }
        });
      },
      fail: (err) => { console.error("Write temp failed:", err); wx.showToast({ title: 'Write Fail', icon: 'none' }); }
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