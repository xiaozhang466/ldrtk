# taskstatus.msg
Header header
string taskid

# Navigation state used by the frontend:
# idle, running, paused, completed, stopped, aborted, waiting_for_odom,
# waiting_for_fixed, error.
string status

# 0.0 - 100.0
float64 progress

uint32 current_waypoint_idx
uint32 total_waypoints
string detail
