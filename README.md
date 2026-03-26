# 基于 Mbed 和树莓派的四驱视觉小车 - 客户端部分

## 项目简介

`bluetooth_controller` 是四驱视觉小车系统中的手机端蓝牙控制模块，基于微信小程序实现。它的主要职责包括：

- 搜索并连接蓝牙串口模块
- 向 mbed 主控发送控制命令
- 提供按键模式与摇杆模式的底盘控制界面
- 控制云台与相机功能
- 通过 WebSocket 接收树莓派视频流
- 显示系统收发日志

<p align="center">
   <img alt="65dc829cf0fb321357a5d26b1e8d6f8d" src="https://github.com/user-attachments/assets/23afcac5-2a9b-4c4c-bc2e-b935bedf1ce1" width="600"/>
</p>

## 目录结构

```text
bluetooth_controller/
├─ app.js
├─ app.json
├─ app.wxss
├─ project.config.json
├─ project.private.config.json
├─ sitemap.json
├─ pages
│  ├─ index
│  │  ├─ index.js
│  │  ├─ index.json
│  │  ├─ index.wxml
│  │  └─ index.wxss
│  └─ logs
│     ├─ logs.js
│     ├─ logs.json
│     ├─ logs.wxml
│     └─ logs.wxss
└─ utils
   ├─ locales.js
   └─ util.js
```

## 技术栈与环境依赖

本项目基于微信小程序开发，主要使用：

- WXML
- WXSS
- JavaScript
- 微信小程序 BLE API
- 微信小程序 WebSocket API
- 微信 Canvas 2D

本模块需要运行在支持微信小程序的移动设备上，或微信开发者工具测试环境。项目需要以下权限（于 `app.json` 中声明）：

- 手机蓝牙
- 相册写入权限
- 网络访问能力
- 横屏页面显示

## 主要功能

### 1. 蓝牙搜索与连接

<p align="center">
   <img alt="0bb6d367dd99b5ef374a9907fee3e352" src="https://github.com/user-attachments/assets/9199b2f6-df6e-4b20-ac58-bdd382e5c4c1" width="600"/>
</p>

如上图所示，程序启动后会初始化蓝牙适配器，并支持扫描附近 BLE 设备。

连接逻辑如下：

- 搜索周围蓝牙设备
- 选择目标设备连接
- 获取 BLE 服务与特征值
- 当前实现中查找包含 `FFE0` 的服务
- 使用包含 `FFE1` 的特征值进行读写

这与常见 HC-08 蓝牙串口透传模块的使用方式一致。

### 2. 按键模式控制

在按键模式下，界面提供方向键和功能键。

方向控制通过以下命令实现：`# U`，`# D`，`# L`，`# R`。

按钮按下发送大写命令，松开后发送对应小写命令。

### 3. 摇杆模式控制

切换到摇杆模式后，界面改为虚拟摇杆：

- 根据触摸偏移计算 `(x, y)` 方向向量
- 按固定时间间隔发送 `: V vx vy`
- 松手后发送 `: V 0.0000 0.0000`

同时会发送：

- `: SM JS` 进入摇杆模式
- `: SM BT` 返回按键模式

### 4. 速度调节

界面中包含速度滑块，变化时会发送：`SPD n`

用于调整底盘速度等级。

### 5. 原始命令输入

界面中保留了一个原始命令输入框，可直接向设备发送文本命令，便于调试协议。

### 6. 视频查看

小程序支持通过 WebSocket 连接树莓派视频流服务。

默认代码中的连接地址为：`ws://192.168.137.178:8765`

连接成功后：

- 接收 JPEG Base64 图像帧
- 使用 Canvas 绘制到界面中
- 显示为可拖动的视频窗口

### 7. 拍照与录像控制

视频窗口中提供了拍照和录像按钮，发送命令为：

- `: CAM SHOT`
- `: CAM REC`
- `: CAM END`

当树莓派返回 `PHOTO:` 开头的 Base64 图像时，小程序会：

- 写入临时文件
- 保存到手机相册

### 8. AI 与跟踪控制

界面支持直接控制视觉功能：

- `: AI 1/0`
- `: TRK 1/0`

对应打开或关闭识别、跟踪功能。

### 9. 云台控制

界面左右两侧提供云台方向调节按钮：

- 左右调整 `LR`
- 上下调整 `UD`

命令格式为：

- `: SVO LR angle`
- `: SVO UD angle`

发送角度做了符号取反处理，以对应实际情况。

### 10. 日志显示

页面内包含一个 mini console，用于显示：

- 发送日志 `Tx>`
- 接收日志 `Rx<`
- 系统状态日志

## 页面结构

<p align="center">
   <img alt="4826fe84163fb3b7368c603ffa2b0057" src="https://github.com/user-attachments/assets/7eea0691-a95d-4feb-a083-b8b55d21018a" width="600"/>
</p>

如上图所示，主页面 `pages/index/index.wxml` 包含以下区域：

- 连接与扫描界面
- 设备列表
- 中英切换按钮
- 日志显示区
- 指令输入区
- 左侧方向控制区
- 中间系统与速度控制区
- 右侧功能键区
- 云台控制区
- 可拖动视频窗口

## 多语言支持

项目在 `utils/locales.js` 中实现了中英双语文本资源。启动时会根据系统语言自动选择显示语言，并支持手动切换。

## 与其他模块的协作关系

本模块将所有的用户输入转发给 mbed 主控程序，再由主控处理或继续分发给树莓派。

## 运行与调试

### 开发方式

推荐使用微信开发者工具打开项目目录进行开发和调试。

### 调试要点

- 若扫描不到设备，检查手机蓝牙与权限
- 若连接失败，检查目标模块是否为 BLE 串口设备
- 若无法收发数据，检查 `FFE0/FFE1` 服务特征是否匹配
- 若视频打不开，检查树莓派 IP 地址和 WebSocket 服务状态
- 若照片保存失败，检查相册权限是否已授权
