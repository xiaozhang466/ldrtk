#!/usr/bin/env python3
"""Publish UM982 RTK fixed position and dual-antenna heading.

This node is intentionally narrow: it reads the already-working orchard RTK
serial stream, parses position/heading messages, and publishes ROS topics for
the future RTK-first navigation stack.
"""

from __future__ import annotations

import math
import os
import re
import signal
import time
from dataclasses import dataclass
from typing import Any

import rospy
import serial
import yaml
from geometry_msgs.msg import TwistWithCovarianceStamped
from nav_msgs.msg import Odometry
from sensor_msgs.msg import NavSatFix, NavSatStatus
from std_msgs.msg import String, UInt8, UInt16


SUPPORTED_BAUDS = (9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600)

QUALITY_LABELS = {
    0: "no_fix",
    1: "gps_fix",
    2: "dgps",
    3: "pps",
    4: "rtk_fixed",
    5: "rtk_float",
    6: "dead_reckoning",
    7: "manual_input",
    8: "simulation",
    9: "waas",
}

TALKER_SERVICES = {
    "GP": NavSatStatus.SERVICE_GPS,
    "GL": NavSatStatus.SERVICE_GLONASS,
    "GA": NavSatStatus.SERVICE_GALILEO,
    "GB": NavSatStatus.SERVICE_COMPASS,
    "BD": NavSatStatus.SERVICE_COMPASS,
    "GN": (
        NavSatStatus.SERVICE_GPS
        | NavSatStatus.SERVICE_GLONASS
        | NavSatStatus.SERVICE_GALILEO
        | NavSatStatus.SERVICE_COMPASS
    ),
}

COORDINATE_MODES = ("absolute_utm", "local_origin")


@dataclass
class GgaData:
    raw: str
    talker: str
    latitude: float
    longitude: float
    altitude: float
    quality: int
    satellites: int
    hdop: float | None
    age: float | None
    station_id: str


@dataclass
class HeadingData:
    raw: str
    heading_deg: float
    pitch_deg: float | None
    roll_deg: float | None
    source: str
    baseline_m: float | None = None


@dataclass(frozen=True)
class AntennaOffset:
    x: float
    y: float
    z: float


def load_yaml(path: str) -> dict[str, Any]:
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"config must be a YAML mapping: {path}")
    return data


def nested_get(data: dict[str, Any], path: str, default: Any) -> Any:
    current: Any = data
    for key in path.split("."):
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def normalize_heading_deg(value: float) -> float:
    value = math.fmod(value, 360.0)
    if value < 0.0:
        value += 360.0
    return value


def yaw_to_quaternion(yaw: float) -> tuple[float, float, float, float]:
    half = yaw * 0.5
    return 0.0, 0.0, math.sin(half), math.cos(half)


def compass_heading_to_map_yaw(heading_deg: float) -> float:
    """Convert north-clockwise heading to ROS ENU yaw.

    Map x is UTM easting and map y is UTM northing, so ROS yaw is measured
    counterclockwise from east.
    """

    return math.radians(normalize_heading_deg(90.0 - heading_deg))


def verify_nmea_checksum(sentence: str) -> bool:
    if "*" not in sentence:
        return True
    body, checksum_text = sentence[1:].split("*", 1)
    checksum_text = checksum_text[:2]
    try:
        expected = int(checksum_text, 16)
    except ValueError:
        return False
    actual = 0
    for char in body:
        actual ^= ord(char)
    return actual == expected


def parse_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def offset_from_config(data: dict[str, Any], path: str, default: AntennaOffset) -> AntennaOffset:
    value = nested_get(data, path, None)
    if not isinstance(value, dict):
        return default
    return AntennaOffset(
        x=float(value.get("x", default.x)),
        y=float(value.get("y", default.y)),
        z=float(value.get("z", default.z)),
    )


def distance_between_offsets(a: AntennaOffset, b: AntennaOffset) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def parse_nmea_coordinate(raw_value: str, hemisphere: str, is_latitude: bool) -> float:
    if not raw_value or not hemisphere:
        raise ValueError("missing coordinate field")
    degree_digits = 2 if is_latitude else 3
    degrees = float(raw_value[:degree_digits])
    minutes = float(raw_value[degree_digits:])
    value = degrees + minutes / 60.0
    if hemisphere in ("S", "W"):
        value = -value
    elif hemisphere not in ("N", "E"):
        raise ValueError(f"invalid hemisphere {hemisphere}")
    return value


def parse_gga_sentence(sentence: str) -> GgaData | None:
    sentence = sentence.strip()
    if not sentence.startswith("$") or "GGA" not in sentence:
        return None
    if not verify_nmea_checksum(sentence):
        raise ValueError(f"invalid NMEA checksum: {sentence}")

    body = sentence[1:].split("*", 1)[0]
    fields = body.split(",")
    if len(fields) < 15:
        raise ValueError(f"incomplete GGA sentence: {sentence}")
    if not fields[0].endswith("GGA"):
        return None

    quality = parse_int(fields[6], default=0)
    altitude_msl = parse_float(fields[9])
    geoid_separation = parse_float(fields[11])
    latitude = math.nan
    longitude = math.nan
    altitude = math.nan

    if quality > 0:
        latitude = parse_nmea_coordinate(fields[2], fields[3], is_latitude=True)
        longitude = parse_nmea_coordinate(fields[4], fields[5], is_latitude=False)
        if altitude_msl is not None and geoid_separation is not None:
            altitude = altitude_msl + geoid_separation
        elif altitude_msl is not None:
            altitude = altitude_msl

    return GgaData(
        raw=sentence,
        talker=fields[0][:2],
        latitude=latitude,
        longitude=longitude,
        altitude=altitude,
        quality=quality,
        satellites=parse_int(fields[7], default=0),
        hdop=parse_float(fields[8]),
        age=parse_float(fields[13]),
        station_id=fields[14],
    )


def quality_to_label(quality: int) -> str:
    return QUALITY_LABELS.get(quality, f"unknown_{quality}")


def quality_to_navsat_status(quality: int) -> int:
    if quality <= 0:
        return NavSatStatus.STATUS_NO_FIX
    if quality in (2, 3, 4, 5, 9):
        return NavSatStatus.STATUS_GBAS_FIX
    return NavSatStatus.STATUS_FIX


def covariance_from_quality(quality: int, hdop: float | None) -> tuple[list[float], int]:
    if quality <= 0:
        return [0.0] * 9, NavSatFix.COVARIANCE_TYPE_UNKNOWN

    hdop_value = hdop if hdop is not None and hdop > 0.0 else 1.0
    base_sigma_xy = {
        1: 2.5,
        2: 0.8,
        3: 0.8,
        4: 0.03,
        5: 0.35,
        9: 0.8,
    }.get(quality, 5.0)
    hdop_scale = {
        1: 1.5,
        2: 0.8,
        3: 0.8,
        4: 0.03,
        5: 0.35,
        9: 0.8,
    }.get(quality, 2.0)

    sigma_xy = max(base_sigma_xy, hdop_value * hdop_scale)
    sigma_z = max(sigma_xy * 2.0, base_sigma_xy * 2.0)
    covariance = [0.0] * 9
    covariance[0] = sigma_xy * sigma_xy
    covariance[4] = sigma_xy * sigma_xy
    covariance[8] = sigma_z * sigma_z
    return covariance, NavSatFix.COVARIANCE_TYPE_APPROXIMATED


def parse_rtkstatus(sentence: str) -> tuple[str, str] | None:
    sentence = sentence.strip()
    if not sentence.startswith("#RTKSTATUSA"):
        return None
    payload = sentence.split(";", 1)
    if len(payload) != 2:
        return sentence, ""
    fields = payload[1].split("*", 1)[0].split(",")
    raw_position_type = fields[11].strip() if len(fields) > 11 else ""
    position_type = raw_position_type.split("$", 1)[0].split("#", 1)[0].strip()
    if position_type and not re.fullmatch(r"[A-Z0-9_]+", position_type):
        position_type = ""
    if position_type.endswith("_"):
        position_type = ""
    return sentence, position_type


def strip_unicore_sentence(sentence: str) -> tuple[str, str] | None:
    sentence = sentence.strip()
    if not sentence.startswith(("#", "$")):
        return None
    data = sentence[1:].split("*", 1)[0]
    if ";" not in data:
        return None
    header, body = data.split(";", 1)
    return header, body


def parse_heading_sentence(
    sentence: str,
    heading_offset_deg: float,
    min_baseline_m: float,
    max_baseline_m: float,
) -> HeadingData | None:
    parsed = strip_unicore_sentence(sentence)
    if not parsed:
        return None
    header, body = parsed
    message_name = header.split(",", 1)[0]

    if message_name in ("GPHPR", "GPTHS"):
        fields = body.split(",")
        if len(fields) < 2:
            return None
        heading = normalize_heading_deg(float(fields[0]) + heading_offset_deg)
        pitch = parse_float(fields[1])
        roll = parse_float(fields[2]) if len(fields) > 2 else None
        return HeadingData(
            raw=sentence.strip(),
            heading_deg=heading,
            pitch_deg=pitch,
            roll_deg=roll,
            source=message_name,
        )

    if message_name not in ("MSPOSA", "MSPOSB"):
        return None

    sol1_pos = body.find("SOL")
    if sol1_pos < 0:
        return None
    sol2_pos = body.find("SOL", sol1_pos + 1)
    if sol2_pos < 0:
        return None
    ant1_fields = body[sol1_pos:sol2_pos].split(",")
    ant2_fields = body[sol2_pos:].split(",")
    if len(ant1_fields) < 8 or len(ant2_fields) < 8:
        return None

    lat1 = float(ant1_fields[2])
    lon1 = float(ant1_fields[3])
    lat2 = float(ant2_fields[2])
    lon2 = float(ant2_fields[3])

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = lat2_rad - lat1_rad
    dlon = math.radians(lon2 - lon1)
    baseline_m = math.hypot(dlat, dlon * math.cos(lat1_rad)) * 6371000.0
    if baseline_m < min_baseline_m or baseline_m > max_baseline_m:
        return None

    # Bearing from ANT1 to ANT2, converted to vehicle yaw by configured offset.
    bearing_deg = math.degrees(math.atan2(dlon * math.cos(lat2_rad), dlat))
    heading = normalize_heading_deg(bearing_deg + heading_offset_deg)
    return HeadingData(
        raw=sentence.strip(),
        heading_deg=heading,
        pitch_deg=None,
        roll_deg=None,
        source=message_name,
        baseline_m=baseline_m,
    )


def parse_mspos_position(sentence: str) -> tuple[float, float, float] | None:
    parsed = strip_unicore_sentence(sentence)
    if not parsed:
        return None
    header, body = parsed
    message_name = header.split(",", 1)[0]
    if message_name not in ("MSPOSA", "MSPOSB"):
        return None
    sol1_pos = body.find("SOL")
    if sol1_pos < 0:
        return None
    sol2_pos = body.find("SOL", sol1_pos + 1)
    ant1_str = body[sol1_pos:sol2_pos] if sol2_pos >= 0 else body[sol1_pos:]
    fields = ant1_str.split(",")
    if len(fields) < 5:
        return None
    return float(fields[2]), float(fields[3]), float(fields[4])


def wgs84_to_utm(lat: float, lon: float) -> tuple[int, float, float]:
    a = 6378137.0
    f = 1 / 298.257223563
    k0 = 0.9996
    e2 = 2 * f - f * f
    e4 = e2 * e2
    e6 = e4 * e2
    ep2 = e2 / (1 - e2)

    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    zone = int((lon + 180) / 6) + 1
    lon_origin = math.radians((zone - 1) * 6 - 180 + 3)

    sin_lat = math.sin(lat_r)
    cos_lat = math.cos(lat_r)
    tan_lat = math.tan(lat_r)
    n = a / math.sqrt(1 - e2 * sin_lat**2)
    t = tan_lat**2
    c = ep2 * cos_lat**2
    aa = cos_lat * (lon_r - lon_origin)

    a0 = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256
    a2 = 3 / 8 * (e2 + e4 / 4 + 15 * e6 / 128)
    a4 = 15 / 256 * (e4 + 3 * e6 / 4)
    a6 = 35 * e6 / 3072
    m = a * (a0 * lat_r - a2 * math.sin(2 * lat_r) + a4 * math.sin(4 * lat_r) - a6 * math.sin(6 * lat_r))

    easting = k0 * n * (aa + (1 - t + c) * aa**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * ep2) * aa**5 / 120)
    northing = k0 * (m + n * tan_lat * (aa**2 / 2 + (5 - t + 9 * c + 4 * c**2) * aa**4 / 24))
    if lat < 0:
        northing += 10000000
    easting += 500000
    return zone, easting, northing


class UM982RtkNode:
    def __init__(self) -> None:
        config_path = os.path.abspath(rospy.get_param("~config", ""))
        cfg = load_yaml(config_path) if config_path else {}

        self.serial_device = rospy.get_param("~serial_device", nested_get(cfg, "serial_device", "/dev/ttyrtk"))
        self.baud = int(rospy.get_param("~baud", nested_get(cfg, "baud", 115200)))
        self.frame_id = rospy.get_param("~frame_id", nested_get(cfg, "frame_id", "gps_link"))
        self.odom_frame_id = rospy.get_param("~odom_frame_id", nested_get(cfg, "odom_frame_id", "map"))
        self.base_frame_id = rospy.get_param("~base_frame_id", nested_get(cfg, "base_frame_id", "base_link"))

        self.read_timeout = float(nested_get(cfg, "output.read_timeout", 0.2))
        self.reconnect_delay = float(nested_get(cfg, "output.reconnect_delay", 1.0))
        self.status_interval = float(nested_get(cfg, "output.status_interval", 5.0))
        self.rtkstatus_query_interval = float(nested_get(cfg, "output.rtkstatus_query_interval", 1.0))
        self.bad_sentence_warn_interval = float(nested_get(cfg, "output.bad_sentence_warn_interval", 10.0))
        self.publish_compat_aliases = bool(nested_get(cfg, "output.publish_compat_aliases", True))

        self.heading_offset_deg = float(nested_get(cfg, "antenna.heading_offset_deg", -90.0))
        self.heading_covariance_deg = float(nested_get(cfg, "antenna.heading_covariance_deg", 1.0))
        self.min_baseline_m = float(nested_get(cfg, "antenna.min_baseline_m", 0.05))
        self.max_baseline_m = float(nested_get(cfg, "antenna.max_baseline_m", 10.0))
        self.primary_antenna_offset = offset_from_config(cfg, "antenna.primary", AntennaOffset(0.0, 0.0, 0.0))
        self.secondary_antenna_offset = offset_from_config(cfg, "antenna.secondary", AntennaOffset(0.0, 0.0, 0.0))
        self.apply_position_offset = bool(nested_get(cfg, "antenna.apply_position_offset", True))

        self.coordinate_mode = str(nested_get(cfg, "position.coordinate_mode", "absolute_utm")).strip().lower()
        if self.coordinate_mode not in COORDINATE_MODES:
            raise ValueError(f"unsupported position.coordinate_mode {self.coordinate_mode}; choose one of {COORDINATE_MODES}")
        self.auto_origin = bool(nested_get(cfg, "position.auto_origin", True))
        self.fixed_only_for_origin = bool(nested_get(cfg, "position.fixed_only_for_origin", True))
        self.origin_lat = float(nested_get(cfg, "position.origin_lat", 0.0))
        self.origin_lon = float(nested_get(cfg, "position.origin_lon", 0.0))
        self.origin_alt = float(nested_get(cfg, "position.origin_alt", 0.0))
        self.has_origin = self.coordinate_mode == "absolute_utm" or (
            not self.auto_origin and (self.origin_lat != 0.0 or self.origin_lon != 0.0)
        )
        self.origin_zone = 0
        self.origin_easting = 0.0
        self.origin_northing = 0.0
        if self.coordinate_mode == "local_origin" and self.has_origin:
            self.origin_zone, self.origin_easting, self.origin_northing = wgs84_to_utm(self.origin_lat, self.origin_lon)

        startup_commands = nested_get(cfg, "startup_commands", [])
        self.startup_commands = [str(command).strip() for command in startup_commands if str(command).strip()]

        if self.baud not in SUPPORTED_BAUDS:
            raise ValueError(f"unsupported baud {self.baud}; choose one of {SUPPORTED_BAUDS}")

        self.fix_pub = rospy.Publisher("/rtk/fix", NavSatFix, queue_size=10)
        self.fix_alias_pub = rospy.Publisher("/gps/fix", NavSatFix, queue_size=10) if self.publish_compat_aliases else None
        self.quality_pub = rospy.Publisher("/rtk/fix_quality", UInt8, queue_size=10)
        self.fix_type_pub = rospy.Publisher("/rtk/fix_type", String, queue_size=10)
        self.sat_pub = rospy.Publisher("/rtk/satellites", UInt16, queue_size=10)
        self.sat_alias_pub = rospy.Publisher("/gps/satellites", UInt16, queue_size=10) if self.publish_compat_aliases else None
        self.gga_pub = rospy.Publisher("/rtk/gga_raw", String, queue_size=20)
        self.rtkstatus_pub = rospy.Publisher("/rtk/rtkstatus_raw", String, queue_size=20)
        self.position_type_pub = rospy.Publisher("/rtk/position_type", String, queue_size=20)
        self.heading_pub = rospy.Publisher("/rtk/heading", TwistWithCovarianceStamped, queue_size=10)
        self.heading_alias_pub = rospy.Publisher("/gps/heading", TwistWithCovarianceStamped, queue_size=10) if self.publish_compat_aliases else None
        self.odom_pub = rospy.Publisher("/odometry/rtk", Odometry, queue_size=20)
        self.odom_alias_pub = rospy.Publisher("/odometry/gps", Odometry, queue_size=20) if self.publish_compat_aliases else None
        self.status_pub = rospy.Publisher("/um982_rtk/status", String, queue_size=5, latch=True)

        self.last_gga: GgaData | None = None
        self.last_heading: HeadingData | None = None
        self.last_position_type = ""
        self.last_status_at = 0.0
        self.last_fix_label = ""

        rospy.loginfo(
            "um982_rtk configured: serial=%s baud=%d frame_id=%s odom_frame=%s coordinate_mode=%s aliases=%s",
            self.serial_device,
            self.baud,
            self.frame_id,
            self.odom_frame_id,
            self.coordinate_mode,
            self.publish_compat_aliases,
        )
        configured_baseline = distance_between_offsets(self.primary_antenna_offset, self.secondary_antenna_offset)
        rospy.loginfo(
            "um982_rtk antenna offsets: primary=(%.3f, %.3f, %.3f) secondary=(%.3f, %.3f, %.3f) "
            "configured_baseline=%.3fm apply_position_offset=%s",
            self.primary_antenna_offset.x,
            self.primary_antenna_offset.y,
            self.primary_antenna_offset.z,
            self.secondary_antenna_offset.x,
            self.secondary_antenna_offset.y,
            self.secondary_antenna_offset.z,
            configured_baseline,
            self.apply_position_offset,
        )

    def open_serial(self) -> serial.Serial:
        return serial.Serial(
            port=self.serial_device,
            baudrate=self.baud,
            timeout=self.read_timeout,
            write_timeout=1.0,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
        )

    def send_command(self, port: serial.Serial, command: str) -> None:
        payload = command.encode("ascii") + b"\r\n"
        port.write(payload)
        port.flush()

    def publish_gga(self, gga: GgaData) -> None:
        now = rospy.Time.now()
        msg = NavSatFix()
        msg.header.stamp = now
        msg.header.frame_id = self.frame_id
        msg.status.status = quality_to_navsat_status(gga.quality)
        msg.status.service = TALKER_SERVICES.get(gga.talker, NavSatStatus.SERVICE_GPS)

        if gga.quality > 0:
            msg.latitude = gga.latitude
            msg.longitude = gga.longitude
            msg.altitude = gga.altitude
            covariance, covariance_type = covariance_from_quality(gga.quality, gga.hdop)
            msg.position_covariance = covariance
            msg.position_covariance_type = covariance_type
        else:
            msg.latitude = math.nan
            msg.longitude = math.nan
            msg.altitude = math.nan
            msg.position_covariance = [0.0] * 9
            msg.position_covariance_type = NavSatFix.COVARIANCE_TYPE_UNKNOWN

        self.fix_pub.publish(msg)
        if self.fix_alias_pub:
            self.fix_alias_pub.publish(msg)
        self.quality_pub.publish(UInt8(data=max(0, gga.quality)))
        self.fix_type_pub.publish(String(data=quality_to_label(gga.quality)))
        sat_msg = UInt16(data=max(0, gga.satellites))
        self.sat_pub.publish(sat_msg)
        if self.sat_alias_pub:
            self.sat_alias_pub.publish(sat_msg)
        self.gga_pub.publish(String(data=gga.raw))
        self.last_gga = gga

        label = quality_to_label(gga.quality)
        if label != self.last_fix_label:
            rospy.loginfo(
                "RTK fix changed to %s lat=%.8f lon=%.8f sats=%d hdop=%s",
                label,
                gga.latitude if not math.isnan(gga.latitude) else 0.0,
                gga.longitude if not math.isnan(gga.longitude) else 0.0,
                gga.satellites,
                "n/a" if gga.hdop is None else f"{gga.hdop:.2f}",
            )
            self.last_fix_label = label

        self.maybe_init_origin(gga)
        self.publish_odometry()

    def maybe_init_origin(self, gga: GgaData) -> None:
        if self.coordinate_mode != "local_origin" or self.has_origin or not self.auto_origin or gga.quality <= 0:
            return
        if self.fixed_only_for_origin and gga.quality != 4:
            return
        self.origin_lat = gga.latitude
        self.origin_lon = gga.longitude
        self.origin_alt = 0.0 if math.isnan(gga.altitude) else gga.altitude
        self.origin_zone, self.origin_easting, self.origin_northing = wgs84_to_utm(gga.latitude, gga.longitude)
        self.has_origin = True
        rospy.loginfo(
            "RTK odometry origin set from %s: lat=%.8f lon=%.8f alt=%.3f zone=%d",
            quality_to_label(gga.quality),
            self.origin_lat,
            self.origin_lon,
            self.origin_alt,
            self.origin_zone,
        )

    def publish_heading(self, heading: HeadingData) -> None:
        now = rospy.Time.now()
        msg = TwistWithCovarianceStamped()
        msg.header.stamp = now
        msg.header.frame_id = self.odom_frame_id
        # Keep this topic as a compass-style heading for the existing frontend:
        # north=0 deg, east=90 deg, clockwise positive.
        yaw = math.radians(heading.heading_deg)
        msg.twist.twist.angular.z = yaw
        heading_std = math.radians(self.heading_covariance_deg)
        msg.twist.covariance[35] = heading_std * heading_std
        self.heading_pub.publish(msg)
        if self.heading_alias_pub:
            self.heading_alias_pub.publish(msg)
        self.last_heading = heading
        self.publish_odometry()

    def publish_odometry(self) -> None:
        if self.last_gga is None or self.last_gga.quality <= 0:
            return
        if self.coordinate_mode == "local_origin" and not self.has_origin:
            return
        gga = self.last_gga
        zone, easting, northing = wgs84_to_utm(gga.latitude, gga.longitude)
        if self.coordinate_mode == "local_origin" and zone != self.origin_zone:
            rospy.logwarn_throttle(10.0, "UTM zone changed from %d to %d", self.origin_zone, zone)

        odom = Odometry()
        odom.header.stamp = rospy.Time.now()
        odom.header.frame_id = self.odom_frame_id
        odom.child_frame_id = self.base_frame_id
        altitude = 0.0 if math.isnan(gga.altitude) else gga.altitude
        if self.coordinate_mode == "absolute_utm":
            odom.pose.pose.position.x = easting
            odom.pose.pose.position.y = northing
            odom.pose.pose.position.z = altitude
        else:
            odom.pose.pose.position.x = easting - self.origin_easting
            odom.pose.pose.position.y = northing - self.origin_northing
            odom.pose.pose.position.z = altitude - self.origin_alt

        if self.last_heading is not None:
            yaw = compass_heading_to_map_yaw(self.last_heading.heading_deg)
            if self.apply_position_offset:
                offset = self.primary_antenna_offset
                map_dx = offset.x * math.cos(yaw) - offset.y * math.sin(yaw)
                map_dy = offset.x * math.sin(yaw) + offset.y * math.cos(yaw)
                odom.pose.pose.position.x -= map_dx
                odom.pose.pose.position.y -= map_dy
                odom.pose.pose.position.z -= offset.z
            qx, qy, qz, qw = yaw_to_quaternion(yaw)
            odom.pose.pose.orientation.x = qx
            odom.pose.pose.orientation.y = qy
            odom.pose.pose.orientation.z = qz
            odom.pose.pose.orientation.w = qw
            heading_std = math.radians(self.heading_covariance_deg)
            odom.pose.covariance[35] = heading_std * heading_std
        else:
            odom.pose.pose.orientation.w = 1.0
            odom.pose.covariance[35] = 999.0

        covariance, _cov_type = covariance_from_quality(gga.quality, gga.hdop)
        odom.pose.covariance[0] = covariance[0]
        odom.pose.covariance[7] = covariance[4]
        odom.pose.covariance[14] = covariance[8]
        odom.pose.covariance[21] = 999.0
        odom.pose.covariance[28] = 999.0

        self.odom_pub.publish(odom)
        if self.odom_alias_pub:
            self.odom_alias_pub.publish(odom)

    def publish_rtkstatus(self, raw_status: str, position_type: str) -> None:
        self.rtkstatus_pub.publish(String(data=raw_status))
        if position_type:
            self.position_type_pub.publish(String(data=position_type))
            if position_type != self.last_position_type:
                rospy.loginfo("UM982 position type changed to %s", position_type)
                self.last_position_type = position_type

    def publish_status_summary(self) -> None:
        now = time.monotonic()
        if now - self.last_status_at < self.status_interval:
            return
        self.last_status_at = now
        if self.last_gga is None:
            text = "ok=false reason=waiting_for_gga"
        else:
            gga = self.last_gga
            heading_text = "none"
            position_reference = "primary_antenna"
            if self.last_heading is not None:
                heading_text = f"{self.last_heading.heading_deg:.2f} source={self.last_heading.source}"
                if self.last_heading.baseline_m is not None:
                    heading_text += f" baseline={self.last_heading.baseline_m:.3f}"
                if self.apply_position_offset:
                    position_reference = "base_link"
            origin_text = "not_required" if self.coordinate_mode == "absolute_utm" else str(self.has_origin)
            text = (
                f"ok={gga.quality > 0} fix={quality_to_label(gga.quality)} "
                f"lat={gga.latitude:.8f} lon={gga.longitude:.8f} "
                f"sats={gga.satellites} hdop={gga.hdop if gga.hdop is not None else -1:.2f} "
                f"heading={heading_text} position_reference={position_reference} "
                f"coordinate_mode={self.coordinate_mode} origin={origin_text}"
            )
        self.status_pub.publish(String(data=text))
        rospy.loginfo("UM982 RTK status: %s", text)

    def handle_line(self, line: str) -> None:
        if not line:
            return

        try:
            gga = parse_gga_sentence(line)
        except ValueError as exc:
            rospy.logwarn_throttle(self.bad_sentence_warn_interval, "Discarding bad GGA: %s", exc)
            gga = None
        if gga is not None:
            self.publish_gga(gga)
            return

        rtkstatus = parse_rtkstatus(line)
        if rtkstatus is not None:
            raw_status, position_type = rtkstatus
            self.publish_rtkstatus(raw_status, position_type)
            return

        try:
            heading = parse_heading_sentence(
                line,
                self.heading_offset_deg,
                self.min_baseline_m,
                self.max_baseline_m,
            )
        except (TypeError, ValueError) as exc:
            rospy.logwarn_throttle(self.bad_sentence_warn_interval, "Discarding bad heading sentence: %s", exc)
            heading = None
        if heading is not None:
            self.publish_heading(heading)
            return

        # MSPOSA can also carry ANT1 position. Use it as a fallback if GGA is
        # absent, but do not override GGA-derived fix quality/status.
        try:
            mspos_position = parse_mspos_position(line)
        except (TypeError, ValueError):
            mspos_position = None
        if mspos_position is not None and self.last_gga is None:
            lat, lon, alt = mspos_position
            synthetic_gga = GgaData(
                raw=line,
                talker="GN",
                latitude=lat,
                longitude=lon,
                altitude=alt,
                quality=4,
                satellites=0,
                hdop=None,
                age=None,
                station_id="",
            )
            self.publish_gga(synthetic_gga)

    def run(self) -> None:
        while not rospy.is_shutdown():
            port: serial.Serial | None = None
            try:
                port = self.open_serial()
                rospy.loginfo("Opened UM982 serial port %s at %d baud", self.serial_device, self.baud)
                for command in self.startup_commands:
                    self.send_command(port, command)
                    rospy.loginfo("Sent UM982 startup command: %s", command)
                    rospy.sleep(0.05)

                rx_buffer = bytearray()
                next_rtkstatus_at = time.monotonic() + self.rtkstatus_query_interval
                while not rospy.is_shutdown():
                    incoming = port.read(port.in_waiting or 1)
                    if incoming:
                        rx_buffer.extend(incoming.replace(b"\r", b"\n"))
                        while b"\n" in rx_buffer:
                            raw_line, _, rx_buffer = rx_buffer.partition(b"\n")
                            line = raw_line.decode("ascii", errors="ignore").strip()
                            self.handle_line(line)

                    now = time.monotonic()
                    if self.rtkstatus_query_interval > 0.0 and now >= next_rtkstatus_at:
                        self.send_command(port, "RTKSTATUSA")
                        next_rtkstatus_at = now + self.rtkstatus_query_interval
                    self.publish_status_summary()

            except (serial.SerialException, OSError) as exc:
                rospy.logwarn("UM982 serial connection failed on %s: %s", self.serial_device, exc)
            except Exception as exc:  # pylint: disable=broad-except
                rospy.logerr("UM982 RTK node stopped by unexpected error: %s", exc)
            finally:
                if port is not None:
                    try:
                        port.close()
                    except Exception:
                        pass
            if not rospy.is_shutdown():
                rospy.sleep(self.reconnect_delay)


def main() -> int:
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    rospy.init_node("um982_rtk_node", anonymous=False)
    node = UM982RtkNode()
    node.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
