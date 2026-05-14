# gpsStatus.msg
Header header            # 标准头信息
int32 status             #-1 - 无信号，0-普通，1- 差分
int32 star               #搜星数量
bool  ntrip_ok           #NTRIP 基站连接状态 (true=已连接, false=断开)         
