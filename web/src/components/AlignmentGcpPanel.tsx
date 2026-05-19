import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  AimOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import * as ROSLIB from 'roslib'
import { alignmentApi, type AlignmentStatus } from '../api'
import { useRos } from '../hooks/useRos'

const { Text } = Typography

const RECORDER_NS = '/gcp_recorder'
const STATUS_TOPIC = `${RECORDER_NS}/status`
const PROGRESS_TOPIC = `${RECORDER_NS}/progress`
const RECORD_SRV = `${RECORDER_NS}/record_control_point`
const SOLVE_SRV = `${RECORDER_NS}/solve_alignment`
const MANAGE_SRV = `${RECORDER_NS}/manage_control_point`

const RECORD_SRV_TYPE = 'rtk_interfaces/RecordControlPoint'
const SOLVE_SRV_TYPE = 'rtk_interfaces/SolveAlignment'
const MANAGE_SRV_TYPE = 'rtk_interfaces/ManageControlPoint'

interface ControlPointEntry {
  id: string
  name: string
  rtk: { x: number; y: number; yaw_rad: number; yaw_deg: number }
  lidar: { x: number; y: number; yaw_rad: number; yaw_deg: number }
  std: { pos_m: number; yaw_deg: number }
  sample_count: number
  duration_sec: number
  recorded_at: string
}

interface LastSolveDetail {
  tx: number
  ty: number
  yaw_rad: number
  yaw_deg: number
  rmse_m: number
  max_error_m: number
  yaw_rmse_deg: number
  yaw_max_deg: number
  loo_rmse_m: number
  loo_max_m: number
  loo_yaw_rmse_deg: number
  loo_yaw_max_deg: number
  num_points: number
  gn_iterations: number
  triangle_area_m2: number
  spatial_spread_m: number
  output_path: string
  warnings: string[]
  per_point_residuals: Array<{ id: string; name: string; pos_m: number; yaw_deg: number }>
  per_point_loo: Array<{ id: string; name: string; pos_m: number; yaw_deg: number }>
  created_at: string
}

interface StatusPayload {
  state: 'idle' | 'recording'
  map_name: string
  persistence_file: string
  alignment_file: string
  min_points_to_solve: number
  control_points: ControlPointEntry[]
  config: {
    record_duration_sec: number
    max_pos_std_m: number
    max_yaw_std_deg: number
    max_solve_rmse_m: number
    max_solve_yaw_rmse_deg: number
    max_loo_rmse_m: number
    max_loo_yaw_rmse_deg: number
  }
  last_solve: LastSolveDetail | null
}

interface ProgressPayload {
  state: 'recording'
  elapsed_sec: number
  duration_sec: number
  remaining_sec: number
  rtk_sample_count: number
  lidar_sample_count: number
  rtk_pos_std_m: number
  rtk_yaw_std_deg: number
  lidar_pos_std_m: number
  lidar_yaw_std_deg: number
  rtk_speed_mps: number
  lidar_speed_mps: number
  rtk_quality: number | null
  name: string
}

interface AlignmentGcpPanelProps {
  mapName: string
  alignmentStatus: AlignmentStatus | null
  refreshStatus: () => Promise<void>
  onAligned?: () => void
}

const formatM = (value: number | undefined, digits = 3) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return `${value.toFixed(digits)} m`
}

const formatCm = (value: number | undefined, digits = 2) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return `${(value * 100).toFixed(digits)} cm`
}

const formatDeg = (value: number | undefined, digits = 2) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return `${value.toFixed(digits)}°`
}

const formatMm = (value: number | undefined, digits = 1) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return `${(value * 1000).toFixed(digits)} mm`
}

const qualityTag = (q: number | null | undefined) => {
  if (q === undefined || q === null) return <Tag color="default">未知</Tag>
  if (q === 4) return <Tag color="green">固定 (4)</Tag>
  if (q === 5) return <Tag color="gold">浮点 (5)</Tag>
  if (q === 0) return <Tag color="red">无解 (0)</Tag>
  return <Tag color="orange">{`质量 ${q}`}</Tag>
}

const AlignmentGcpPanel: React.FC<AlignmentGcpPanelProps> = ({
  mapName,
  alignmentStatus,
  refreshStatus,
  onAligned,
}) => {
  const { ros, connected } = useRos()
  const [statusPayload, setStatusPayload] = useState<StatusPayload | null>(null)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [isStartingNode, setIsStartingNode] = useState(false)
  const [isStoppingNode, setIsStoppingNode] = useState(false)
  const [pendingPointName, setPendingPointName] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSolving, setIsSolving] = useState(false)
  const [resultModal, setResultModal] = useState<LastSolveDetail | null>(null)

  const statusTopicRef = useRef<ROSLIB.Topic | null>(null)
  const progressTopicRef = useRef<ROSLIB.Topic | null>(null)

  const recorderRunning = !!alignmentStatus?.gcp_running && alignmentStatus.active_gcp_map === mapName

  useEffect(() => {
    if (!recorderRunning || !connected || !ros?.getRos) {
      setStatusPayload(null)
      setProgress(null)
      return
    }
    const rosInstance = ros.getRos()
    if (!rosInstance) return

    const statusTopic = new ROSLIB.Topic({
      ros: rosInstance,
      name: STATUS_TOPIC,
      messageType: 'std_msgs/String',
    })
    statusTopicRef.current = statusTopic
    statusTopic.subscribe((msg: any) => {
      try {
        const parsed: StatusPayload = JSON.parse(msg.data)
        setStatusPayload(parsed)
      } catch (err) {
        console.warn('GCP status JSON parse error:', err)
      }
    })

    const progressTopic = new ROSLIB.Topic({
      ros: rosInstance,
      name: PROGRESS_TOPIC,
      messageType: 'std_msgs/String',
    })
    progressTopicRef.current = progressTopic
    progressTopic.subscribe((msg: any) => {
      try {
        const parsed: ProgressPayload = JSON.parse(msg.data)
        setProgress(parsed)
      } catch (err) {
        console.warn('GCP progress JSON parse error:', err)
      }
    })

    return () => {
      try {
        statusTopic.unsubscribe()
      } catch (err) {
        // ignore
      }
      try {
        progressTopic.unsubscribe()
      } catch (err) {
        // ignore
      }
      statusTopicRef.current = null
      progressTopicRef.current = null
    }
  }, [recorderRunning, connected, ros])

  const callService = useCallback(
    async <Req extends object, Res extends object>(
      name: string,
      serviceType: string,
      request: Req
    ): Promise<Res> => {
      if (!ros || !connected || !ros.getRos) {
        throw new Error('未连接到 ROS，请先确认 rosbridge 已启动')
      }
      const rosInstance = ros.getRos()
      if (!rosInstance) throw new Error('ROS 实例不存在')
      return new Promise((resolve, reject) => {
        const service = new ROSLIB.Service({
          ros: rosInstance,
          name,
          serviceType,
        })
        const req = new ROSLIB.ServiceRequest(request as any)
        service.callService(
          req,
          (response: any) => resolve(response as Res),
          (error: any) => reject(new Error(typeof error === 'string' ? error : 'ROS 服务调用失败')),
        )
      })
    },
    [ros, connected],
  )

  const handleStartNode = async () => {
    if (!mapName) {
      message.warning('请先选择地图')
      return
    }
    setIsStartingNode(true)
    try {
      await alignmentApi.startGcp(mapName)
      message.success('GCP 标定节点已启动')
      await refreshStatus()
    } catch (err: any) {
      message.error(err?.message || 'GCP 节点启动失败')
    } finally {
      setIsStartingNode(false)
    }
  }

  const handleStopNode = async () => {
    setIsStoppingNode(true)
    try {
      await alignmentApi.stopGcp(mapName)
      message.success('GCP 标定节点已停止')
      await refreshStatus()
    } catch (err: any) {
      message.error(err?.message || 'GCP 节点停止失败')
    } finally {
      setIsStoppingNode(false)
    }
  }

  const handleRecord = async () => {
    if (!recorderRunning) {
      message.warning('请先启动 GCP 标定节点')
      return
    }
    if (isRecording) return
    setIsRecording(true)
    try {
      const response = await callService<
        { name: string; duration_sec: number },
        {
          accepted: boolean
          reason: string
          point_id: string
          rtk_x: number
          rtk_y: number
          rtk_yaw_rad: number
          lidar_x: number
          lidar_y: number
          lidar_yaw_rad: number
          pos_std_max_m: number
          yaw_std_max_deg: number
          sample_count: number
        }
      >(RECORD_SRV, RECORD_SRV_TYPE, {
        name: pendingPointName,
        duration_sec: 0,
      })
      if (response.accepted) {
        message.success(`控制点已接受: ${response.point_id}`)
        setPendingPointName('')
      } else {
        Modal.warning({
          title: '控制点被拒收',
          content: response.reason || '未知原因',
        })
      }
    } catch (err: any) {
      message.error(err?.message || '采集失败')
    } finally {
      setIsRecording(false)
      setProgress(null)
    }
  }

  const handleDelete = async (pointId: string) => {
    try {
      const response = await callService<
        { action: string; point_id: string },
        { success: boolean; reason: string; remaining_count: number }
      >(MANAGE_SRV, MANAGE_SRV_TYPE, { action: 'delete', point_id: pointId })
      if (response.success) {
        message.success('已删除控制点')
      } else {
        message.error(response.reason || '删除失败')
      }
    } catch (err: any) {
      message.error(err?.message || '删除失败')
    }
  }

  const handleClearAll = async () => {
    try {
      const response = await callService<
        { action: string; point_id: string },
        { success: boolean; reason: string; remaining_count: number }
      >(MANAGE_SRV, MANAGE_SRV_TYPE, { action: 'clear', point_id: '' })
      if (response.success) {
        message.success('已清空所有控制点')
      } else {
        message.error(response.reason || '清空失败')
      }
    } catch (err: any) {
      message.error(err?.message || '清空失败')
    }
  }

  const handleSolve = async () => {
    if (isSolving) return
    setIsSolving(true)
    try {
      const response = await callService<
        { map_name: string },
        {
          success: boolean
          reason: string
          tx: number
          ty: number
          yaw_rad: number
          rmse_m: number
          max_error_m: number
          yaw_rmse_deg: number
          yaw_max_deg: number
          loo_rmse_m: number
          loo_max_m: number
          loo_yaw_rmse_deg: number
          loo_yaw_max_deg: number
          num_points: number
          gauss_newton_iterations: number
          output_path: string
        }
      >(SOLVE_SRV, SOLVE_SRV_TYPE, { map_name: '' })
      if (!response.success) {
        Modal.error({ title: '求解失败', content: response.reason || '未知错误' })
        return
      }
      const passedAll =
        !response.reason &&
        response.rmse_m <= (statusPayload?.config.max_solve_rmse_m ?? 0.03) &&
        response.yaw_rmse_deg <= (statusPayload?.config.max_solve_yaw_rmse_deg ?? 0.5) &&
        response.loo_rmse_m <= (statusPayload?.config.max_loo_rmse_m ?? 0.03) &&
        response.loo_yaw_rmse_deg <= (statusPayload?.config.max_loo_yaw_rmse_deg ?? 0.8)
      if (response.reason) {
        Modal.warning({ title: '求解完成，但存在告警', content: response.reason })
      } else if (passedAll) {
        message.success('求解通过所有验收阈值')
      }
      await refreshStatus()
      onAligned?.()
    } catch (err: any) {
      message.error(err?.message || '求解失败')
    } finally {
      setIsSolving(false)
    }
  }

  const points = statusPayload?.control_points ?? []
  const lastSolve = statusPayload?.last_solve ?? null

  const sigmaPosOK = useMemo(() => {
    if (!progress) return null
    const limit = statusPayload?.config.max_pos_std_m ?? 0.01
    return progress.rtk_pos_std_m <= limit
  }, [progress, statusPayload])

  const sigmaYawOK = useMemo(() => {
    if (!progress) return null
    const limit = statusPayload?.config.max_yaw_std_deg ?? 0.5
    return progress.rtk_yaw_std_deg <= limit
  }, [progress, statusPayload])

  const renderPointsTable = () => {
    const columns = [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        width: 120,
        render: (text: string, row: ControlPointEntry) => text || <Text type="secondary">{row.id}</Text>,
      },
      {
        title: 'RTK x / y (m)',
        key: 'rtk_xy',
        render: (row: ControlPointEntry) => `${row.rtk.x.toFixed(3)} / ${row.rtk.y.toFixed(3)}`,
      },
      {
        title: 'LiDAR x / y (m)',
        key: 'lid_xy',
        render: (row: ControlPointEntry) => `${row.lidar.x.toFixed(3)} / ${row.lidar.y.toFixed(3)}`,
      },
      {
        title: 'RTK yaw',
        key: 'rtk_yaw',
        render: (row: ControlPointEntry) => formatDeg(row.rtk.yaw_deg),
      },
      {
        title: 'LiDAR yaw',
        key: 'lid_yaw',
        render: (row: ControlPointEntry) => formatDeg(row.lidar.yaw_deg),
      },
      {
        title: 'σ 位置 / 航向',
        key: 'std',
        render: (row: ControlPointEntry) => `${formatMm(row.std.pos_m)} / ${formatDeg(row.std.yaw_deg)}`,
      },
      {
        title: '样本',
        dataIndex: 'sample_count',
        key: 'sample_count',
        width: 80,
      },
      {
        title: '操作',
        key: 'actions',
        width: 80,
        render: (row: ControlPointEntry) => (
          <Popconfirm title={`删除控制点 ${row.name || row.id}?`} onConfirm={() => handleDelete(row.id)}>
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ]
    return (
      <Table
        size="small"
        dataSource={points}
        columns={columns as any}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: <Empty description="尚未录到控制点" /> }}
      />
    )
  }

  const renderSolveSummary = (solve: LastSolveDetail | null) => {
    if (!solve) return null
    const cfg = statusPayload?.config
    const posPass = cfg ? solve.rmse_m <= cfg.max_solve_rmse_m : true
    const yawPass = cfg ? solve.yaw_rmse_deg <= cfg.max_solve_yaw_rmse_deg : true
    const looPosPass = cfg ? solve.loo_rmse_m <= cfg.max_loo_rmse_m : true
    const looYawPass = cfg ? solve.loo_yaw_rmse_deg <= cfg.max_loo_yaw_rmse_deg : true
    return (
      <Card size="small" title="最近一次求解结果" extra={<Button size="small" onClick={() => setResultModal(solve)}>详情</Button>}>
        <Space wrap size="large">
          <Statistic title="tx" value={solve.tx} precision={3} suffix="m" />
          <Statistic title="ty" value={solve.ty} precision={3} suffix="m" />
          <Statistic title="yaw" value={solve.yaw_deg} precision={3} suffix="°" />
          <Statistic
            title="位置 RMSE"
            value={solve.rmse_m * 100}
            precision={2}
            suffix="cm"
            valueStyle={{ color: posPass ? '#52c41a' : '#ff4d4f' }}
          />
          <Statistic
            title="航向 RMSE"
            value={solve.yaw_rmse_deg}
            precision={3}
            suffix="°"
            valueStyle={{ color: yawPass ? '#52c41a' : '#ff4d4f' }}
          />
          <Statistic
            title="LOO 位置 RMSE"
            value={solve.loo_rmse_m * 100}
            precision={2}
            suffix="cm"
            valueStyle={{ color: looPosPass ? '#52c41a' : '#ff4d4f' }}
          />
          <Statistic
            title="LOO 航向 RMSE"
            value={solve.loo_yaw_rmse_deg}
            precision={3}
            suffix="°"
            valueStyle={{ color: looYawPass ? '#52c41a' : '#ff4d4f' }}
          />
          <Statistic title="控制点数" value={solve.num_points} />
          <Statistic title="GN 迭代" value={solve.gn_iterations} />
        </Space>
        {solve.warnings && solve.warnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="存在未通过的阈值"
            description={
              <ul style={{ paddingLeft: 16, marginBottom: 0 }}>
                {solve.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            }
          />
        )}
        <Space style={{ marginTop: 12 }} wrap>
          <Text type="secondary">输出：</Text>
          <Text code copyable>{solve.output_path}</Text>
        </Space>
      </Card>
    )
  }

  if (!mapName) {
    return <Alert type="info" showIcon message="请先在地图列表中选择一张包含 GPS 原点和 PCD 的地图" />
  }

  return (
    <div>
      <Card size="small" title={<><AimOutlined /> GCP 节点</>} style={{ marginBottom: 16 }}>
        <Space wrap>
          {recorderRunning ? (
            <Tag color="green" icon={<CheckCircleOutlined />}>节点运行中 ({alignmentStatus?.active_gcp_map})</Tag>
          ) : (
            <Tag color="default">节点未启动</Tag>
          )}
          {!recorderRunning && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={isStartingNode}
              disabled={!mapName || alignmentStatus?.calibration_running}
              onClick={handleStartNode}
            >
              启动 GCP 节点
            </Button>
          )}
          {recorderRunning && (
            <Button
              danger
              icon={<StopOutlined />}
              loading={isStoppingNode}
              onClick={handleStopNode}
            >
              停止 GCP 节点
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={refreshStatus}>刷新</Button>
        </Space>
        {alignmentStatus?.calibration_running && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="动态采样标定正在运行，请先停止它，再启动 GCP 标定。"
          />
        )}
      </Card>

      <Card
        size="small"
        title="采集控制点"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            {statusPayload && (
              <Text type="secondary">
                持久化：<Text code>{statusPayload.persistence_file}</Text>
              </Text>
            )}
          </Space>
        }
      >
        <Space wrap>
          <Input
            placeholder="控制点名称（可选，例如：入口/中心）"
            value={pendingPointName}
            onChange={(e) => setPendingPointName(e.target.value)}
            style={{ width: 240 }}
            disabled={isRecording}
          />
          <Tooltip title={!recorderRunning ? '请先启动 GCP 节点' : '小车停稳后点击，期间保持静止'}>
            <Button
              type="primary"
              icon={<AimOutlined />}
              loading={isRecording}
              disabled={!recorderRunning}
              onClick={handleRecord}
            >
              采集控制点（{statusPayload?.config.record_duration_sec ?? 30} 秒）
            </Button>
          </Tooltip>
          <Popconfirm
            title="清空所有控制点？此操作不可恢复"
            onConfirm={handleClearAll}
            disabled={!recorderRunning || points.length === 0}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!recorderRunning || points.length === 0}
            >
              清空全部
            </Button>
          </Popconfirm>
        </Space>
        {progress && (
          <Card type="inner" size="small" style={{ marginTop: 12 }} title={`录制中 ${progress.name || ''}`}>
            <Progress
              percent={Math.min(
                100,
                Math.round((progress.elapsed_sec / Math.max(progress.duration_sec, 1)) * 100),
              )}
              format={(p) =>
                `${p}% · 剩余 ${progress.remaining_sec.toFixed(1)}s`
              }
            />
            <Space wrap size="large" style={{ marginTop: 12 }}>
              <Statistic title="RTK 样本数" value={progress.rtk_sample_count} />
              <Statistic title="LiDAR 样本数" value={progress.lidar_sample_count} />
              <Statistic
                title="RTK 位置 σ"
                value={progress.rtk_pos_std_m * 1000}
                precision={1}
                suffix="mm"
                valueStyle={{ color: sigmaPosOK == null ? undefined : sigmaPosOK ? '#52c41a' : '#ff4d4f' }}
              />
              <Statistic
                title="RTK 航向 σ"
                value={progress.rtk_yaw_std_deg}
                precision={2}
                suffix="°"
                valueStyle={{ color: sigmaYawOK == null ? undefined : sigmaYawOK ? '#52c41a' : '#ff4d4f' }}
              />
              <Statistic
                title="RTK 速度"
                value={progress.rtk_speed_mps}
                precision={3}
                suffix="m/s"
                valueStyle={{ color: progress.rtk_speed_mps <= 0.05 ? '#52c41a' : '#ff4d4f' }}
              />
              <div>
                <Text type="secondary">RTK 解</Text>
                <div>{qualityTag(progress.rtk_quality)}</div>
              </div>
            </Space>
          </Card>
        )}
      </Card>

      <Card size="small" title={`已采控制点 (${points.length})`} style={{ marginBottom: 16 }}>
        {renderPointsTable()}
        <Space style={{ marginTop: 12 }} wrap>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={isSolving}
            disabled={!recorderRunning || points.length < (statusPayload?.min_points_to_solve ?? 3)}
            onClick={handleSolve}
          >
            求解并写入 {statusPayload?.min_points_to_solve ?? 3} 点以上
          </Button>
          {points.length > 0 && points.length < (statusPayload?.min_points_to_solve ?? 3) && (
            <Text type="warning">
              <WarningOutlined /> 还需要 {(statusPayload?.min_points_to_solve ?? 3) - points.length} 个控制点
            </Text>
          )}
        </Space>
      </Card>

      {renderSolveSummary(lastSolve)}

      <Modal
        title="求解详情"
        open={!!resultModal}
        onCancel={() => setResultModal(null)}
        footer={null}
        width={720}
      >
        {resultModal && (
          <div>
            <Space wrap size="large" style={{ marginBottom: 16 }}>
              <Statistic title="三角形面积" value={resultModal.triangle_area_m2} precision={2} suffix=" m²" />
              <Statistic title="空间分布" value={resultModal.spatial_spread_m} precision={2} suffix=" m" />
              <Statistic title="位置最大点" value={resultModal.max_error_m * 100} precision={2} suffix=" cm" />
              <Statistic title="LOO 位置最大点" value={resultModal.loo_max_m * 100} precision={2} suffix=" cm" />
              <Statistic title="LOO 航向最大点" value={resultModal.loo_yaw_max_deg} precision={3} suffix=" °" />
            </Space>
            <Table
              size="small"
              dataSource={resultModal.per_point_residuals.map((r, idx) => ({
                ...r,
                loo: resultModal.per_point_loo[idx],
                key: r.id,
              }))}
              columns={
                [
                  { title: '点', dataIndex: 'name', render: (t: string, r: any) => t || r.id },
                  {
                    title: '拟合 位置 / 航向',
                    render: (r: any) => `${formatCm(r.pos_m)} / ${formatDeg(r.yaw_deg)}`,
                  },
                  {
                    title: 'LOO 位置 / 航向',
                    render: (r: any) =>
                      r.loo ? `${formatCm(r.loo.pos_m)} / ${formatDeg(r.loo.yaw_deg)}` : '--',
                  },
                ] as any
              }
              pagination={false}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AlignmentGcpPanel
