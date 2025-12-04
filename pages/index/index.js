// index.js
Page({
  data: {
    isConnected: false,
    isScanning: false,
    devices: [],
    connectedDeviceId: '',
    serviceId: '',
    characteristicId: '',
    connectedName: '',
    inputText: '',

    // 摇杆 & 速度
    isJoystickMode: false,
    stickX: 0,
    stickY: 0,
    joystickRadius: 0,
    centerX: 0,
    centerY: 0,
    lastSendTime: 0,
    speed: 5,

    // 日志系统
    logList: [],
    scrollTop: 0
  },

  // --- 1. 日志处理 ---
  addLog(msg) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,0)}:${now.getMinutes().toString().padStart(2,0)}:${now.getSeconds().toString().padStart(2,0)}`;
    const newLog = `[${time}] ${msg}`;
    
    let list = this.data.logList;
    if (list.length > 20) list.shift(); 
    list.push(newLog);
    
    this.setData({ 
      logList: list,
      scrollTop: list.length * 50 
    });
  },

  // --- 2. 核心发送逻辑 (自动加换行 \n) ---
  sendData(str) {
    // 界面回显
    this.addLog(`Tx> ${str}`);

    if (this.data.connectedDeviceId === 'DEBUG') return;
    if (!this.data.isConnected) return;

    // 协议封装：自动追加换行符
    const sendStr = str + '\n';

    // 转 ArrayBuffer
    const buffer = new ArrayBuffer(sendStr.length);
    const dataView = new DataView(buffer);
    for (let i = 0; i < sendStr.length; i++) {
      dataView.setUint8(i, sendStr.charCodeAt(i));
    }

    wx.writeBLECharacteristicValue({
      deviceId: this.data.connectedDeviceId,
      serviceId: this.data.serviceId,
      characteristicId: this.data.characteristicId,
      value: buffer,
      fail: (err) => this.addLog(`Err: ${err.errMsg}`)
    });
  },

  // --- 3. 单按键指令 (格式: # A) ---
  handleBtnPress(e) {
    if (!this.data.isConnected) return;
    const char = e.currentTarget.dataset.char;
    if (char) this.sendData(`# ${char.toUpperCase()}`);
  },
  handleBtnRelease(e) {
    if (!this.data.isConnected) return;
    const char = e.currentTarget.dataset.char;
    if (char) this.sendData(`# ${char.toLowerCase()}`);
  },

  // --- 4. 复杂指令 ---
  
  // 输入框发送 -> : CMD 内容
  sendInputCmd() {
    if (this.data.inputText) {
      this.sendData(`: CMD ${this.data.inputText}`);
    }
  },

  // 速度调节 -> : SPD 5
  handleSpeedChange(e) {
    const val = e.detail.value;
    this.setData({ speed: val });
    this.sendData(`: SPD ${val}`);
  },

  // 模式切换 -> : SM JS / : SM BT
  toggleMode() {
    const newMode = !this.data.isJoystickMode;
    this.setData({ isJoystickMode: newMode });
    
    if (newMode) {
      this.sendData(": SM JS"); 
      setTimeout(() => { this.initJoystick(); }, 200);
    } else {
      this.sendData(": SM BT"); 
    }
  },

  // --- 5. 摇杆逻辑 (核心修改：笛卡尔坐标系) ---
  stickMove(e) {
    if (!this.data.isConnected) return;
    const touch = e.touches[0];
    
    // 1. 计算屏幕坐标系下的偏移 (X向右增，Y向下增)
    let diffX = touch.pageX - this.data.centerX;
    let diffY = touch.pageY - this.data.centerY;
    
    // 2. 限制在圆内 (UI显示逻辑，保持屏幕坐标系)
    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
    const maxRadius = this.data.joystickRadius;

    if (distance > maxRadius) {
      const angle = Math.atan2(diffY, diffX);
      diffX = Math.cos(angle) * maxRadius;
      diffY = Math.sin(angle) * maxRadius;
    }
    
    // 更新UI (UI层必须使用屏幕坐标)
    this.setData({ stickX: diffX, stickY: diffY });

    // 3. 计算输出向量 (笛卡尔坐标系转换)
    const now = Date.now();
    if (now - this.data.lastSendTime > 100) {
      // X轴：屏幕向右为正 -> 笛卡尔X正 (不变)
      const unitX = (diffX / maxRadius).toFixed(2);
      
      // Y轴：屏幕向下为正 -> 笛卡尔Y负 (取反)
      // 添加负号，使得向上推为正值，向下推为负值
      const unitY = (-diffY / maxRadius).toFixed(2); 

      this.sendData(`: V ${unitX} ${unitY}`);
      this.data.lastSendTime = now;
    }
  },

  stickEnd() {
    this.setData({ stickX: 0, stickY: 0 });
    this.sendData(": V 0.00 0.00");
  },

  // --- 6. 基础连接逻辑 ---
  handleInput(e) { this.setData({ inputText: e.detail.value }); },
  
  enterDebugMode() {
    this.setData({ isConnected: true, connectedName: '调试模式', connectedDeviceId: 'DEBUG', isScanning: false });
    this.addLog("调试模式启动");
    wx.stopBluetoothDevicesDiscovery();
    setTimeout(() => { if(this.data.isJoystickMode) this.initJoystick(); }, 200);
  },

  startScan() {
    this.setData({ isScanning: true, devices: [], logList: [] });
    this.addLog("开始搜索...");
    wx.openBluetoothAdapter({
      success: () => {
        wx.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false });
        wx.onBluetoothDeviceFound((res) => {
          res.devices.forEach(device => {
            if (device.name && !this.data.devices.some(d => d.deviceId === device.deviceId)) {
              this.setData({ devices: [...this.data.devices, device] });
            }
          });
        });
      },
      fail: () => {
        this.setData({ isScanning: false });
        wx.showToast({ title: '请开启蓝牙', icon: 'none' });
        this.addLog("蓝牙初始化失败");
      }
    });
  },

  connectDevice(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.stopBluetoothDevicesDiscovery();
    wx.showLoading({ title: '连接中' });
    this.addLog(`连接: ${name}`);
    wx.createBLEConnection({
      deviceId: id,
      success: () => {
        this.setData({ connectedDeviceId: id, connectedName: name });
        this.getServices(id);
      },
      fail: (err) => { 
        wx.hideLoading(); 
        this.addLog(`连接失败: ${err.errMsg}`);
      }
    });
  },

  getServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        const s = res.services.find(i => i.uuid.toUpperCase().includes('FFE0'));
        if (s) { this.setData({ serviceId: s.uuid }); this.getCharacteristics(deviceId, s.uuid); }
      }
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
          this.addLog("就绪.");
        }
      }
    });
  },

  disconnect() {
    if (this.data.connectedDeviceId && this.data.connectedDeviceId !== 'DEBUG') {
      wx.closeBLEConnection({ deviceId: this.data.connectedDeviceId });
    }
    this.setData({ isConnected: false, devices: [] });
    this.addLog("断开连接");
  },

  initJoystick() {
    const query = wx.createSelectorQuery();
    query.select('#joystick-bg').boundingClientRect();
    query.exec((res) => {
      if (res[0]) {
        this.setData({
          centerX: res[0].left + res[0].width / 2,
          centerY: res[0].top + res[0].height / 2,
          joystickRadius: res[0].width / 2 - 20
        });
      }
    });
  },
  stickStart(e) { this.stickMove(e); }
});