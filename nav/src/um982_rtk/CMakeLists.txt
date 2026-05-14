cmake_minimum_required(VERSION 3.0.2)
project(um982_rtk)

find_package(catkin REQUIRED COMPONENTS
  geometry_msgs
  nav_msgs
  rospy
  rtk_interfaces
  sensor_msgs
  std_msgs
  tf
)

catkin_package(
  CATKIN_DEPENDS geometry_msgs nav_msgs rospy rtk_interfaces sensor_msgs std_msgs tf
)

catkin_install_python(PROGRAMS
  scripts/um982_rtk_node.py
  scripts/um982_rtk_nav_node.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)

install(DIRECTORY
  config
  launch
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}
)
