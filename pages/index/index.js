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
    inputText: ''
  },

  // --- 蓝牙连接逻辑 (复用之前的基础逻辑) ---
  
  startScan() {
    this.setData({ isScanning: true, devices: [] });
    wx.openBluetoothAdapter({
      success: () => {
        wx.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false });
        wx.onBluetoothDeviceFound((res) => {
          res.devices.forEach(device => {
            if (device.name && device.name.trim().length > 0) {
              // 简单的去重逻辑
              if (!this.data.devices.some(d => d.deviceId === device.deviceId)) {
                this.setData({ devices: [...this.data.devices, device] });
              }
            }
          });
        });
      },
      fail: () => {
        this.setData({ isScanning: false });
        wx.showToast({ title: '请打开蓝牙', icon: 'none' });
      }
    });
  },

  connectDevice(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.stopBluetoothDevicesDiscovery();
    wx.showLoading({ title: '连接中...' });
    
    wx.createBLEConnection({
      deviceId: id,
      success: () => {
        this.setData({ connectedDeviceId: id, connectedName: name });
        this.getServices(id);
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '连接失败', icon: 'none' });
      }
    });
  },

  getServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        // 查找 FFE0 服务
        const service = res.services.find(s => s.uuid.toUpperCase().includes('FFE0'));
        if (service) {
          this.setData({ serviceId: service.uuid });
          this.getCharacteristics(deviceId, service.uuid);
        } else {
          wx.hideLoading();
          wx.showToast({ title: '未找到服务', icon: 'none' });
        }
      }
    });
  },

  getCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        // 查找 FFE1 特征值
        const char = res.characteristics.find(c => c.uuid.toUpperCase().includes('FFE1'));
        if (char) {
          this.setData({ 
            characteristicId: char.uuid,
            isConnected: true 
          });
          wx.hideLoading();
          wx.showToast({ title: '连接成功', icon: 'success' });
        }
      }
    });
  },

  disconnect() {
    if (this.data.connectedDeviceId) {
      wx.closeBLEConnection({
        deviceId: this.data.connectedDeviceId,
        success: () => {
          this.setData({ isConnected: false, devices: [] });
        }
      });
    }
  },

  // --- 手柄控制核心逻辑 ---

  // 按下按钮：发送大写字母
  handleBtnPress(e) {
    if (!this.data.isConnected) return;
    const char = e.currentTarget.dataset.char; // 获取 U,D,L,R,A,B...
    if (char) {
      console.log(`按下: ${char}`);
      this.sendData(char.toUpperCase()); // 发送大写
    }
  },

  // 松开按钮：发送小写字母
  handleBtnRelease(e) {
    if (!this.data.isConnected) return;
    const char = e.currentTarget.dataset.char;
    if (char) {
      console.log(`松开: ${char.toLowerCase()}`);
      this.sendData(char.toLowerCase()); // 发送小写
    }
  },

  // 顶部文本框输入发送
  handleInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  sendInputCmd() {
    if (this.data.inputText) {
      this.sendData(this.data.inputText);
      // 可选：发送后清空输入框
      // this.setData({ inputText: '' });
    }
  },

  // 发送数据的底层函数
  sendData(str) {
    if (!this.data.isConnected) {
      // 可以在这里加个轻提示，为了游戏体验通常不加弹窗
      return; 
    }
    const buffer = this.string2buffer(str);
    
    wx.writeBLECharacteristicValue({
      deviceId: this.data.connectedDeviceId,
      serviceId: this.data.serviceId,
      characteristicId: this.data.characteristicId,
      value: buffer,
      fail: (err) => {
        console.error("发送失败", err);
      }
    });
  },

  string2buffer(str) {
    let buffer = new ArrayBuffer(str.length);
    let dataView = new DataView(buffer);
    for (let i = 0; i < str.length; i++) {
      dataView.setUint8(i, str.charCodeAt(i));
    }
    return buffer;
  }
});