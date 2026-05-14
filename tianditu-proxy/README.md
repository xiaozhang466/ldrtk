# 天地图代理服务 - 部署文档

**版本:** 2.0.0 (独立部署)  
**更新日期:** 2026-03-22

---

## RTK 迁移项目启动方式

在迁移项目中，本服务独立放在：

```bash
/home/ros/ZMG/sigu/rtk/tianditu-proxy
```

启动：

```bash
cd /home/ros/ZMG/sigu/rtk/tianditu-proxy
./start.sh
```

停止：

```bash
./stop.sh
```

日志：

```bash
/home/ros/ZMG/sigu/rtk/data/logs/tianditu_proxy.log
```

前端访问地址保持独立代理形式：

```text
http://<host>:5001/api/tianditu
```

---

## 📦 项目结构

```
/home/ros/ZMG/sigu/rtk/tianditu-proxy/
├── app.py                 # 主应用
├── config.py              # 配置文件
├── requirements.txt       # Python 依赖
├── .gitignore            # Git 忽略文件
└── README.md             # 本文档
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /home/ros/ZMG/sigu/rtk/tianditu-proxy
pip3 install -r requirements.txt
```

### 2. 配置服务

编辑 `config.py`:

```python
# API 访问 Token（防止盗链）
API_TOKEN = 'sigu_tdt_2026_secure_token'

# 服务端口
PORT = 5001

# 缓存配置
CACHE_TTL = 3600  # 秒
CACHE_MAX_SIZE = 1000  # 瓦片数
```

### 3. 启动服务

```bash
python3 app.py
```

或使用 systemd 后台运行（见下方）。

---

## 🔧 配置说明

### config.py 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `TDT_TOKEN` | - | 天地图 API Token |
| `API_TOKEN` | - | 访问代理服务的 Token |
| `PORT` | 5001 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `CACHE_TTL` | 3600 | 缓存时长（秒） |
| `CACHE_MAX_SIZE` | 1000 | 最大缓存瓦片数 |
| `CORS_ORIGINS` | ['*'] | 允许的源 |
| `DEBUG` | False | 调试模式 |

### 生成 API Token

```bash
python3 -c "import secrets; print(secrets.token_hex(16))"
```

---

## 📡 API 端点

### 瓦片服务

| 端点 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/tianditu/img_w/<z>/<x>/<y>` | GET | 影像底图瓦片 | `token`（必需） |
| `/api/tianditu/cva_w/<z>/<x>/<y>` | GET | 标注瓦片 | `token`（必需） |

### 管理服务

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tianditu/health` | GET | 健康检查 |
| `/api/tianditu/config` | GET | 获取配置 |
| `/api/tianditu/config` | POST | 更新配置 |
| `/api/tianditu/cache/stats` | GET | 缓存统计 |
| `/api/tianditu/cache/clear` | POST | 清空缓存 |

---

## 🔐 安全配置

### Token 验证

所有瓦片请求必须提供 API Token：

```bash
# 正确示例
curl "http://localhost:5001/api/tianditu/img_w/5/10/20?token=sigu_tdt_2026_secure_token"

# 错误示例（无 Token）
curl "http://localhost:5001/api/tianditu/img_w/5/10/20"
# 返回：403 Forbidden
```

### 文件权限

```bash
# 设置配置文件权限
chmod 600 /home/ros/ZMG/sigu/rtk/tianditu-proxy/config.py
```

### Git 安全

敏感配置已添加到 `.gitignore`：
- `config.local.py` - 本地配置覆盖
- `.env` - 环境变量
- `*.key`, `*.token` - 密钥文件

---

## 🔧 高级配置

### 使用 systemd 后台运行

创建服务文件 `/etc/systemd/system/tianditu-proxy.service`:

```ini
[Unit]
Description=天地图代理服务
After=network.target

[Service]
Type=simple
User=sigu
WorkingDirectory=/home/ros/ZMG/sigu/rtk/tianditu-proxy
ExecStart=/usr/bin/python3 /home/ros/ZMG/sigu/rtk/tianditu-proxy/app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable tianditu-proxy
sudo systemctl start tianditu-proxy
sudo systemctl status tianditu-proxy
```

### 动态配置

通过 API 动态修改配置（无需重启）：

```bash
# 修改缓存 TTL 为 2 小时
curl -X POST http://localhost:5001/api/tianditu/config \
  -H "Content-Type: application/json" \
  -d '{"cache_ttl": 7200}'

# 清空缓存
curl -X POST http://localhost:5001/api/tianditu/cache/clear
```

---

## 📊 监控与维护

### 健康检查

```bash
curl http://localhost:5001/api/tianditu/health
```

返回：
```json
{
  "status": "ok",
  "service": "tianditu-proxy",
  "version": "2.0.0",
  "cache": {
    "size": 158,
    "max_size": 1000,
    "ttl": 3600
  }
}
```

### 缓存统计

```bash
curl http://localhost:5001/api/tianditu/cache/stats
```

### 日志查看

```bash
# systemd 方式
sudo journalctl -u tianditu-proxy -f

# 直接运行方式
# 日志输出到终端
```

---

## 🌐 前端集成示例

### Cesium.js

```javascript
const API_TOKEN = 'sigu_tdt_2026_secure_token';

const tdtImg = new Cesium.WebMapTileServiceImageryProvider({
  url: `http://<host>:5001/api/tianditu/img_w/{TileMatrix}/{TileCol}/{TileRow}?token=${API_TOKEN}`,
  layer: 'img',
  style: 'default',
  format: 'image/jpeg',
  tileMatrixSetID: 'w',
  maximumLevel: 18
});

viewer.imageryLayers.addImageryProvider(tdtImg);
```

---

## 🔄 从旧版本迁移

### 从混合部署迁移

1. **停止旧服务**
   ```bash
   # 停止业务 API 中的天地图代理
   # （如果有）
   ```

2. **启动独立服务**
   ```bash
   cd /home/ros/ZMG/sigu/rtk/tianditu-proxy
   python3 app.py
   ```

3. **更新前端配置**
   ```javascript
   // 前端配置（端口 5001，带 Token）
   url: `http://<host>:5001/api/tianditu/...?token=${API_TOKEN}`
   ```

4. **验证**
   ```bash
   curl http://<host>:5001/api/tianditu/health
   ```

---

## 📝 更新日志

### v2.0.0 (2026-03-22)

- ✅ 独立部署，不再与业务 API 混合
- ✅ 添加 API Token 验证（防止盗链）
- ✅ 支持动态配置（缓存 TTL、最大缓存数）
- ✅ 添加缓存管理 API（统计、清空）
- ✅ 改进配置文件结构
- ✅ 添加 systemd 部署支持

### v1.0.0 (2026-03-22)

- 初始版本（混合部署）

---

**维护人:** 耘小智 01  
**联系方式:** sigu@example.com
