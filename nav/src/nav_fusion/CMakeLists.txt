cmake_minimum_required(VERSION 3.0.2)
project(nav_fusion)

find_package(catkin REQUIRED COMPONENTS
  geometry_msgs
  nav_msgs
  rospy
  std_msgs
  tf2_ros
  rtk_interfaces
)

catkin_package(
  CATKIN_DEPENDS geometry_msgs nav_msgs rospy std_msgs tf2_ros rtk_interfaces
)

catkin_install_python(PROGRAMS
  scripts/calibrate_frame_alignment.py
  scripts/publish_frame_alignment.py
  scripts/control_point_recorder.py
  scripts/localization_health_monitor.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)

install(DIRECTORY
  config
  launch
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}
)
