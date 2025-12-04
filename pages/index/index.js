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

  // --- 生命周期: 监听意外断开 ---
  onLoad() {
    // 注册蓝牙连接状态监听
    wx.onBLEConnectionStateChange((res) => {
      // 如果当前显示“已连接”，但底层状态变成了“未连接”
      if (!res.connected && this.data.isConnected) {
        this.addLog("⚠️ 蓝牙连接意外断开");
        wx.showToast({ title: '蓝牙已断开', icon: 'none' });
        
        // 强制执行断开清理逻辑，回到初始页
        this.disconnect(); 
      }
    });
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

  // --- 2. 核心发送逻辑 ---
  sendData(str) {
    this.addLog(`Tx> ${str}`);

    if (this.data.connectedDeviceId === 'DEBUG') return;
    if (!this.data.isConnected) return;

    const sendStr = str + '\n'; // 自动追加换行

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

  // --- 3. 按键指令 (# A) ---
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

  // 摇杆逻辑 (4位小数 + 笛卡尔坐标)
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
      const unitY = (-diffY / maxRadius).toFixed(4); // 取反
      this.sendData(`: V ${unitX} ${unitY}`);
      this.data.lastSendTime = now;
    }
  },
  stickEnd() {
    this.setData({ stickX: 0, stickY: 0 });
    this.sendData(": V 0.0000 0.0000");
  },

  // --- 5. 基础连接逻辑 (含超时控制) ---
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

  // 连接设备 (修复超时无法取消 Loading 的问题)
  connectDevice(e) {
    const { id, name } = e.currentTarget.dataset;
    
    // 1. 停止搜索 (这一步很重要，安卓上边搜边连容易卡死)
    wx.stopBluetoothDevicesDiscovery();
    
    // 2. 开启 Loading，mask:true 防止用户乱点
    wx.showLoading({ title: '连接中...', mask: true });
    this.addLog(`尝试连接: ${name}`);

    // 定义一个标志位，判断是否已经超时
    let hasTimedOut = false;

    // 3. 设置 JS 层面的超时定时器 (10秒)
    const timeoutId = setTimeout(() => {
      hasTimedOut = true; // 标记已超时
      wx.hideLoading();   // 强制隐藏转圈
      
      this.addLog("❌ 连接超时 (强制终止)");
      
      // 弹窗提示
      wx.showModal({
        title: '连接超时',
        content: '设备未响应。请尝试：\n1. 重启蓝牙或设备\n2. 确保设备未被连接',
        showCancel: false
      });

      // 关键：超时后，无论底层在干嘛，强制尝试断开一次，释放资源
      wx.closeBLEConnection({ deviceId: id });
    }, 10000);

    // 4. 调用微信 API 开始连接
    wx.createBLEConnection({
      deviceId: id,
      timeout: 10000, // 【新增】告诉微信底层，超过10秒直接报 fail
      success: () => {
        // 如果已经超时了，就算连接成功也要断开，防止 UI 逻辑错乱
        if (hasTimedOut) {
          wx.closeBLEConnection({ deviceId: id });
          return;
        }

        // 正常连接成功
        clearTimeout(timeoutId); // 清除定时器
        
        this.setData({ connectedDeviceId: id, connectedName: name });
        this.getServices(id);
      },
      fail: (err) => {
        // 如果已经超时处理过了，这里就不要再处理了
        if (hasTimedOut) return;

        // 正常连接失败
        clearTimeout(timeoutId); // 清除定时器
        wx.hideLoading();
        
        // 错误码解析（方便调试）
        let tip = '连接失败';
        if (err.errCode === 10003) tip = '连接被断开';
        if (err.errCode === 10012) tip = '连接超时(底层)';
        if (err.errCode === 10009) tip = 'Android系统版本过低';

        this.addLog(`❌ ${tip}: ${err.errMsg}`);
        wx.showToast({ title: tip, icon: 'none' });
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
          this.addLog("✅ 连接成功! 就绪.");
        }
      }
    });
  },

  // 断开连接 / 重置界面
  disconnect() {
    // 如果是调试模式或已连接，尝试断开底层连接
    if (this.data.connectedDeviceId && this.data.connectedDeviceId !== 'DEBUG') {
      wx.closeBLEConnection({ deviceId: this.data.connectedDeviceId });
    }
    
    // 重置所有状态到初始值
    this.setData({ 
      isConnected: false, 
      devices: [],
      connectedDeviceId: '',
      stickX: 0,
      stickY: 0
    });
    
    this.addLog("已断开，回到初始页");
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