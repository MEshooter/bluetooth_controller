// index.js
Page({
  data: {
    isConnected: false,
    isScanning: false,
    isConnecting: false, // 新增：连接锁，防止重复点击
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

    logList: [],
    scrollTop: 0
  },

  // --- 1. 日志处理 ---
  addLog(msg) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,0)}:${now.getMinutes().toString().padStart(2,0)}:${now.getSeconds().toString().padStart(2,0)}`;
    
    let list = this.data.logList;
    if (list.length > 20) list.shift();
    list.push(`[${time}] ${msg}`);
    
    this.setData({ logList: list, scrollTop: list.length * 50 });
  },

  // --- 2. 核心发送逻辑 ---
  sendData(str) {
    this.addLog(`Tx> ${str}`);
    if (this.data.connectedDeviceId === 'DEBUG') return;
    if (!this.data.isConnected) return;

    const sendStr = str + '\n';
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

  // --- 3. 按键与指令 ---
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
  sendInputCmd() {
    if (this.data.inputText) this.sendData(`: CMD ${this.data.inputText}`);
  },
  handleSpeedChange(e) {
    const val = e.detail.value;
    this.setData({ speed: val });
    this.sendData(`: SPD ${val}`);
  },
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

  // --- 4. 摇杆逻辑 ---
  stickMove(e) {
    if (!this.data.isConnected) return;
    const touch = e.touches[0];
    let diffX = touch.pageX - this.data.centerX;
    let diffY = touch.pageY - this.data.centerY;
    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
    const maxRadius = this.data.joystickRadius;

    if (distance > maxRadius) {
      const angle = Math.atan2(diffY, diffX);
      diffX = Math.cos(angle) * maxRadius;
      diffY = Math.sin(angle) * maxRadius;
    }
    this.setData({ stickX: diffX, stickY: diffY });

    const now = Date.now();
    if (now - this.data.lastSendTime > 100) {
      const unitX = (diffX / maxRadius).toFixed(4);
      const unitY = (-diffY / maxRadius).toFixed(4);
      this.sendData(`: V ${unitX} ${unitY}`);
      this.data.lastSendTime = now;
    }
  },
  stickEnd() {
    this.setData({ stickX: 0, stickY: 0 });
    this.sendData(": V 0.0000 0.0000");
  },
  
  // --- 5. 基础逻辑 (iOS 修复版) ---
  handleInput(e) { this.setData({ inputText: e.detail.value }); },

  enterDebugMode() {
    this.setData({ isConnected: true, connectedName: '调试模式', connectedDeviceId: 'DEBUG', isScanning: false });
    this.addLog("调试模式启动");
    wx.stopBluetoothDevicesDiscovery();
    setTimeout(() => { if(this.data.isJoystickMode) this.initJoystick(); }, 200);
  },

  // 【修复 1】iOS 初始化修复：先关闭，再打开
  startScan() {
    this.setData({ isScanning: true, devices: [], logList: [] });
    this.addLog("正在重置蓝牙...");

    // 无论当前状态如何，先尝试关闭适配器，清理缓存状态
    wx.closeBluetoothAdapter({
      complete: () => {
        // 延时一小会，确保 iOS 底层清理完毕
        setTimeout(() => {
          this.initBluetooth();
        }, 200);
      }
    });
  },

  initBluetooth() {
    this.addLog("正在初始化...");
    wx.openBluetoothAdapter({
      success: () => {
        this.addLog("初始化成功");
        this.startDiscovery();
      },
      // index.js -> initBluetooth -> fail 回调

      fail: (err) => {
        this.setData({ isScanning: false });

        // --- 强力调试日志 ---
        // 将错误对象完整转为字符串，这样无论它返回什么奇怪的东西都能看见
        const debugMsg = (typeof err === 'object') ? JSON.stringify(err) : String(err);
        this.addLog(`Init Fail: ${debugMsg}`);
        
        // --- 智能错误提取 ---
        // 优先取 errCode，没有就取 errno，还没有就标记 Unknown
        const code = err.errCode || err.errno || 'Unknown';
        const msg = err.errMsg || '';

        // --- 针对性的用户提示 ---
        
        // 情况1: 隐私协议被拦截 (常见于发布版未配置隐私指引)
        if (msg.includes('privacy') || msg.includes('auth deny')) {
          wx.showModal({
            title: '隐私授权失败',
            content: '小程序需要蓝牙和位置权限才能运行。请删除小程序后重新搜索进入，并同意隐私授权弹窗。',
            showCancel: false
          });
          return;
        }

        // 情况2: 蓝牙没开 / GPS没开
        if (code === 10001 || code === 1500102) {
          wx.showModal({
            title: '蓝牙/定位未开启',
            content: '请下拉手机状态栏：\n1. 开启蓝牙图标\n2. 开启位置信息(GPS)图标',
            showCancel: false
          });
          return;
        }
        
        // 其他情况
        wx.showToast({ title: `初始化误: ${code}`, icon: 'none' });
      }
    });
  },

  startDiscovery() {
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => {
        this.addLog("正在扫描...");
        wx.onBluetoothDeviceFound((res) => {
          res.devices.forEach(device => {
            if (device.name && device.name.trim() !== '' && !this.data.devices.some(d => d.deviceId === device.deviceId)) {
              this.setData({ devices: [...this.data.devices, device] });
            }
          });
        });
      },
      fail: (err) => {
        this.setData({ isScanning: false });
        this.addLog(`Scan Fail: ${err.errMsg}`);
      }
    });
  },

  // 【修复 2】连接逻辑修复：防止重复点击
  connectDevice(e) {
    // 如果正在连接中，忽略点击
    if (this.data.isConnecting) return;

    const { id, name } = e.currentTarget.dataset;
    
    this.addLog(`选中设备: ${name}`); // 打印日志证明点击生效

    // 立即上锁
    this.setData({ isConnecting: true });

    wx.stopBluetoothDevicesDiscovery();
    wx.showLoading({ title: '连接中...', mask: true });

    let hasTimedOut = false;
    const timeoutId = setTimeout(() => {
      hasTimedOut = true;
      wx.hideLoading();
      this.setData({ isConnecting: false }); // 解锁
      wx.showModal({ title: '超时', content: '设备无响应', showCancel: false });
      wx.closeBLEConnection({ deviceId: id });
    }, 10000);

    wx.createBLEConnection({
      deviceId: id,
      timeout: 10000,
      success: () => {
        if (hasTimedOut) {
          wx.closeBLEConnection({ deviceId: id });
          return;
        }
        clearTimeout(timeoutId);
        
        this.setData({ 
          connectedDeviceId: id, 
          connectedName: name,
          isConnecting: false // 解锁
        });
        this.getServices(id);
      },
      fail: (err) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutId);
        wx.hideLoading();
        
        this.setData({ isConnecting: false }); // 解锁
        this.addLog(`Err: ${err.errMsg}`);
        wx.showToast({ title: '连接失败', icon: 'none' });
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
          this.addLog("Ready.");
        }
      }
    });
  },

  disconnect() {
    if (this.data.connectedDeviceId && this.data.connectedDeviceId !== 'DEBUG') {
      wx.closeBLEConnection({ deviceId: this.data.connectedDeviceId });
    }
    this.setData({ isConnected: false, devices: [], isConnecting: false });
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