# 天地图代理服务

独立 Flask 服务，用于代理天地图 WMTS 瓦片，减少前端直接暴露天地图 Token，并提供简单的内存缓存。

## 目录

```text
tianditu-proxy/
├── app.py
├── config.py
├── install_deps.sh
├── requirements.txt
├── start.sh
└── stop.sh
```

## 启动

```bash
cd tianditu-proxy
export TIANDITU_TOKEN="现场天地图 Token"
export TIANDITU_API_TOKEN="可选的代理访问 Token"
./start.sh
```

停止：

```bash
./stop.sh
```

日志和 PID 写入项目根目录下：

```text
data/logs/tianditu_proxy.log
data/logs/tianditu_proxy.pid
```

如果没有使用 `start.sh`，也可以直接运行：

```bash
python3 app.py
```

## API

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/tianditu/img_w/<z>/<x>/<y>` | GET | 影像底图瓦片 |
| `/api/tianditu/cva_w/<z>/<x>/<y>` | GET | 标注瓦片 |
| `/api/tianditu/health` | GET | 健康检查 |
| `/api/tianditu/config` | GET | 查看非敏感配置 |
| `/api/tianditu/config` | POST | 动态更新缓存配置 |
| `/api/tianditu/cache/stats` | GET | 缓存统计 |
| `/api/tianditu/cache/clear` | POST | 清空缓存 |

健康检查：

```bash
curl http://localhost:5001/api/tianditu/health
```

缓存统计：

```bash
curl http://localhost:5001/api/tianditu/cache/stats
```

## Token 说明

`config.py` 从环境变量读取：

- `TIANDITU_TOKEN`：访问天地图官方服务的 Token。
- `TIANDITU_API_TOKEN`：代理服务自己的访问 Token。

注意：当前 `app.py` 中瓦片接口的 `@require_token` 装饰器处于注释状态，因此前端访问瓦片时暂不强制校验 `TIANDITU_API_TOKEN`。如果现场需要防盗链，应恢复 `proxy_img_w` 和 `proxy_cva_w` 上的 `@require_token`。

## 前端集成

前端配置位于 `web/src/config.js`：

- 开发环境：通过 Vite `/api/tianditu` 代理访问。
- 生产环境：访问 `http://<host>:5001/api/tianditu`。

地图组件主要在 `FusionMapForManager.tsx` 和 `MarsMapForManager.jsx` 中使用该服务。

## 缓存配置

默认配置：

```text
CACHE_TTL = 3600
CACHE_MAX_SIZE = 1000
PORT = 5001
HOST = 0.0.0.0
```

动态更新示例：

```bash
curl -X POST http://localhost:5001/api/tianditu/config \
  -H "Content-Type: application/json" \
  -d '{"cache_ttl": 7200, "cache_max_size": 2000}'
```

最后整理：2026-05-18
