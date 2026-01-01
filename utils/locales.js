// utils/locales.js

const TRANS = {
  zh: {
    title: 'HC-08 控制台',
    scan: '搜索蓝牙', scanning: '搜索中...',
    debug: '跳过蓝牙调试 >',
    list_title: '设备列表', empty: '等待搜索...',
    mode_js: '模式:摇杆', mode_btn: '模式:按键',
    speed: '速度',
    connect: '连接中...',
    connected: '已连接',
    disconnect: '连接断开',
    rec_start: '开始录制', rec_end: '录制结束',
    shot: '已拍照',
    save_ok: '保存成功', save_fail: '保存失败',
    
    // === 新增补充 ===
    ble_off: '蓝牙未开启',
    debug_name: '调试模式',
    debug_start: '调试启动',
    conn_fail: '连接失败',
    conn_ok: '连接成功',
    listen_on: '监听开启',
    listen_fail: '监听失败',
    cam_title: '连接视频',
    auth_title: '权限提示',
    auth_msg: '需要保存相册权限才能保存照片，是否去设置？'
  },
  en: {
    title: 'HC-08 Console',
    scan: 'Scan BLE', scanning: 'Scanning...',
    debug: 'Debug Mode >',
    list_title: 'Device List', empty: 'Waiting...',
    mode_js: 'Mode: Stick', mode_btn: 'Mode: Keys',
    speed: 'SPEED',
    connect: 'Connecting...',
    connected: 'Connected',
    disconnect: 'Disconnected',
    rec_start: 'Rec Started', rec_end: 'Rec Stopped',
    shot: 'Shot Taken',
    save_ok: 'Saved', save_fail: 'Failed',

    // === 新增补充 ===
    ble_off: 'Bluetooth Off',
    debug_name: 'Debug Mode',
    debug_start: 'Debug Started',
    conn_fail: 'Conn Failed',
    conn_ok: 'Connected',
    listen_on: 'Listen On',
    listen_fail: 'Listen Fail',
    cam_title: 'Connect Cam',
    auth_title: 'Permission',
    auth_msg: 'Album permission required. Open settings?'
  }
};

module.exports = {
  TRANS: TRANS
};