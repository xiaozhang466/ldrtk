#!/usr/bin/env python3
"""
Convert FAST-LIVO2 output to FAST-LOCALIZATION compatible format.

Key changes:
1. Convert PCD from XYZRGB to XYZI format (FAST-LOCALIZATION expects intensity)
2. Rename timestamp-based PCD files to sequential numbering
3. Convert poses from lidar_poses.txt to pose.json with correct quaternion order
"""

import os
import re
import sys
import shutil
import json
import argparse
import struct
from pathlib import Path

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("Warning: numpy not available, using slower pure Python implementation")


NUM_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def read_pcd_header(filepath):
    """Read PCD file header and return metadata."""
    with open(filepath, 'rb') as f:
        header_lines = []
        while True:
            line = f.readline().decode('utf-8', errors='ignore').strip()
            header_lines.append(line)
            if line.startswith('DATA'):
                break
        
        header = {}
        for line in header_lines:
            parts = line.split(' ', 1)
            if len(parts) == 2:
                header[parts[0]] = parts[1]
        
        data_pos = f.tell()
        
    return header, data_pos


def convert_pcd_rgb_to_intensity(input_path, output_path):
    """
    Convert PCD from XYZRGB format to XYZI format.
    FAST-LOCALIZATION expects: x y z intensity
    FAST-LIVO2 outputs: x y z rgb
    """
    header, data_pos = read_pcd_header(input_path)
    
    fields = header.get('FIELDS', '').split()
    sizes = [int(s) for s in header.get('SIZE', '').split()]
    types = header.get('TYPE', '').split()
    counts = [int(c) for c in header.get('COUNT', '').split()]
    num_points = int(header.get('POINTS', '0'))
    data_type = header.get('DATA', 'ascii')
    
    # Check if this is XYZRGB format
    if 'rgb' not in fields and 'intensity' not in fields:
        # Just copy the file as-is
        shutil.copy2(input_path, output_path)
        return True
    
    # Calculate point size
    point_size = sum(s * c for s, c in zip(sizes, counts))
    
    # Read binary data
    with open(input_path, 'rb') as f:
        f.seek(data_pos)
        if data_type == 'binary':
            data = f.read()
        else:
            # ASCII format - not supported yet
            print(f"Warning: ASCII PCD format not fully supported for {input_path}")
            shutil.copy2(input_path, output_path)
            return True
    
    # Parse points and convert
    points = []
    offset = 0
    
    for i in range(num_points):
        if offset + point_size > len(data):
            break
            
        point_data = data[offset:offset + point_size]
        
        # Parse x, y, z (assuming they are first three float32 fields)
        x = struct.unpack('f', point_data[0:4])[0]
        y = struct.unpack('f', point_data[4:8])[0]
        z = struct.unpack('f', point_data[8:12])[0]
        
        # Parse RGB/intensity field
        if 'rgb' in fields:
            rgb_index = fields.index('rgb')
            rgb_offset = sum(sizes[j] * counts[j] for j in range(rgb_index))
            
            if types[rgb_index] == 'U':
                rgb_val = struct.unpack('I', point_data[rgb_offset:rgb_offset+4])[0]
                # Extract RGB components and convert to grayscale intensity
                r = (rgb_val >> 16) & 0xFF
                g = (rgb_val >> 8) & 0xFF
                b = rgb_val & 0xFF
                # Grayscale conversion
                intensity = 0.299 * r + 0.587 * g + 0.114 * b
            elif types[rgb_index] == 'F':
                rgb_float = struct.unpack('f', point_data[rgb_offset:rgb_offset+4])[0]
                rgb_int = struct.unpack('I', struct.pack('f', rgb_float))[0]
                r = (rgb_int >> 16) & 0xFF
                g = (rgb_int >> 8) & 0xFF
                b = rgb_int & 0xFF
                intensity = 0.299 * r + 0.587 * g + 0.114 * b
            else:
                intensity = 100.0  # Default intensity
        elif 'intensity' in fields:
            int_index = fields.index('intensity')
            int_offset = sum(sizes[j] * counts[j] for j in range(int_index))
            intensity = struct.unpack('f', point_data[int_offset:int_offset+4])[0]
        else:
            intensity = 100.0  # Default
        
        points.append((x, y, z, intensity))
        offset += point_size
    
    # Write new PCD file with full format expected by FAST-LOCALIZATION
    # Required fields: x y z intensity normal_x normal_y normal_z curvature
    with open(output_path, 'wb') as f:
        # Write header
        header_str = f"""# .PCD v0.7 - Point Cloud Data file format
VERSION 0.7
FIELDS x y z intensity normal_x normal_y normal_z curvature
SIZE 4 4 4 4 4 4 4 4
TYPE F F F F F F F F
COUNT 1 1 1 1 1 1 1 1
WIDTH {len(points)}
HEIGHT 1
VIEWPOINT 0 0 0 1 0 0 0
POINTS {len(points)}
DATA binary
"""
        f.write(header_str.encode('utf-8'))
        
        # Write binary point data
        # normal_x, normal_y, normal_z, curvature are set to 0 as they're not critical for localization
        for x, y, z, intensity in points:
            f.write(struct.pack('ffffffff', x, y, z, intensity, 0.0, 0.0, 0.0, 0.0))
    
    return True


def _parse_bracket_numbers(line):
    """Extract all numbers from a YAML inline list."""
    return [float(x) for x in NUM_RE.findall(line)]


def load_lidar_to_imu_extrinsics(config_path):
    """
    Load LiDAR->IMU extrinsics from FAST-LIVO2 YAML without extra deps.

    Expected fields under extrin_calib:
      extrinsic_T: [tx, ty, tz]
      extrinsic_R: [r00, r01, ..., r22]
    """
    extrinsic_t = None
    extrinsic_r = None
    with open(config_path, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if line.startswith('extrinsic_T:'):
                extrinsic_t = _parse_bracket_numbers(line)
            elif line.startswith('extrinsic_R:'):
                extrinsic_r = _parse_bracket_numbers(line)

    if not extrinsic_t or len(extrinsic_t) != 3:
        raise ValueError(f"Failed to parse extrinsic_T from {config_path}")
    if not extrinsic_r or len(extrinsic_r) != 9:
        raise ValueError(f"Failed to parse extrinsic_R from {config_path}")

    if HAS_NUMPY:
        t_il = np.asarray(extrinsic_t, dtype=np.float64)
        r_il = np.asarray(extrinsic_r, dtype=np.float64).reshape(3, 3)
        return r_il, t_il

    # Fallback to nested lists for pure Python math.
    r_flat = extrinsic_r
    r_il = [r_flat[0:3], r_flat[3:6], r_flat[6:9]]
    return r_il, extrinsic_t


def quat_xyzw_to_rot(qx, qy, qz, qw):
    """Quaternion (x,y,z,w) -> rotation matrix."""
    # Normalization guards against slightly non-unit inputs.
    norm = (qx * qx + qy * qy + qz * qz + qw * qw) ** 0.5
    if norm == 0.0:
        qw = 1.0
        qx = qy = qz = 0.0
        norm = 1.0
    qx /= norm
    qy /= norm
    qz /= norm
    qw /= norm

    xx = qx * qx
    yy = qy * qy
    zz = qz * qz
    xy = qx * qy
    xz = qx * qz
    yz = qy * qz
    wx = qw * qx
    wy = qw * qy
    wz = qw * qz

    if HAS_NUMPY:
        return np.array([
            [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)],
            [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)],
            [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)],
        ], dtype=np.float64)

    return [
        [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)],
        [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)],
        [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)],
    ]


def rot_to_quat_xyzw(rot):
    """Rotation matrix -> quaternion (x,y,z,w)."""
    if HAS_NUMPY:
        r00, r01, r02 = rot[0, 0], rot[0, 1], rot[0, 2]
        r10, r11, r12 = rot[1, 0], rot[1, 1], rot[1, 2]
        r20, r21, r22 = rot[2, 0], rot[2, 1], rot[2, 2]
    else:
        r00, r01, r02 = rot[0][0], rot[0][1], rot[0][2]
        r10, r11, r12 = rot[1][0], rot[1][1], rot[1][2]
        r20, r21, r22 = rot[2][0], rot[2][1], rot[2][2]

    trace = r00 + r11 + r22
    if trace > 0.0:
        s = (trace + 1.0) ** 0.5 * 2.0
        qw = 0.25 * s
        qx = (r21 - r12) / s
        qy = (r02 - r20) / s
        qz = (r10 - r01) / s
    elif r00 > r11 and r00 > r22:
        s = (1.0 + r00 - r11 - r22) ** 0.5 * 2.0
        qw = (r21 - r12) / s
        qx = 0.25 * s
        qy = (r01 + r10) / s
        qz = (r02 + r20) / s
    elif r11 > r22:
        s = (1.0 + r11 - r00 - r22) ** 0.5 * 2.0
        qw = (r02 - r20) / s
        qx = (r01 + r10) / s
        qy = 0.25 * s
        qz = (r12 + r21) / s
    else:
        s = (1.0 + r22 - r00 - r11) ** 0.5 * 2.0
        qw = (r10 - r01) / s
        qx = (r02 + r20) / s
        qy = (r12 + r21) / s
        qz = 0.25 * s

    return qx, qy, qz, qw


def transform_imu_to_lidar_pose(tx, ty, tz, qx, qy, qz, qw, r_il, t_il):
    """
    Convert IMU pose (world->imu) into LiDAR pose (world->lidar).

    FAST-LIVO2 uses extrinsic_R/T as LiDAR->IMU (T_i_l).
    We compute: T_w_l = T_w_i * T_i_l
    """
    r_w_i = quat_xyzw_to_rot(qx, qy, qz, qw)

    if HAS_NUMPY:
        t_w_i = np.array([tx, ty, tz], dtype=np.float64)
        r_w_l = r_w_i @ r_il
        t_w_l = r_w_i @ t_il + t_w_i
    else:
        # Minimal pure Python math for 3x3 @ 3x3 and 3x3 @ 3x1.
        def mat_mul(a, b):
            return [
                [
                    a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
                    for j in range(3)
                ]
                for i in range(3)
            ]

        def mat_vec(a, v):
            return [
                a[0][0] * v[0] + a[0][1] * v[1] + a[0][2] * v[2],
                a[1][0] * v[0] + a[1][1] * v[1] + a[1][2] * v[2],
                a[2][0] * v[0] + a[2][1] * v[1] + a[2][2] * v[2],
            ]

        r_w_l = mat_mul(r_w_i, r_il)
        t_rot = mat_vec(r_w_i, t_il)
        t_w_l = [t_rot[0] + tx, t_rot[1] + ty, t_rot[2] + tz]

    qx_l, qy_l, qz_l, qw_l = rot_to_quat_xyzw(r_w_l)
    if HAS_NUMPY:
        return float(t_w_l[0]), float(t_w_l[1]), float(t_w_l[2]), qx_l, qy_l, qz_l, qw_l
    return t_w_l[0], t_w_l[1], t_w_l[2], qx_l, qy_l, qz_l, qw_l


def main():
    parser = argparse.ArgumentParser(description='Convert FAST-LIVO2 output to FAST-LOCALIZATION format')
    parser.add_argument('--input', '-i', type=str, 
                        default='/home/ros/ZMG/fastlivo2_ws/src/FAST-LIVO2/Log/pcd',
                        help='Input directory containing PCD files and lidar_poses.txt')
    parser.add_argument('--output', '-o', type=str,
                        default='/home/ros/ZMG/fastlivo2_ws/fast_localization_map',
                        help='Output directory for FAST-LOCALIZATION map')
    parser.add_argument('--step', '-s', type=int, default=1,
                        help='Step size for keyframe selection (1=all frames, 5=every 5th frame)')
    parser.add_argument('--config', '-c', type=str,
                        default='/home/ros/ZMG/fastlivo2_ws/src/FAST-LIVO2/config/lslidar_C16.yaml',
                        help='FAST-LIVO2 YAML config used to read extrinsic_R/T')
    parser.add_argument('--pose-frame', choices=['imu', 'lidar'], default='lidar',
                        help='Interpret lidar_poses.txt as IMU poses and optionally convert to LiDAR poses')
    
    args = parser.parse_args()
    
    input_dir = args.input
    output_dir = args.output
    step = args.step
    config_path = args.config
    pose_frame = args.pose_frame

    if pose_frame == 'lidar':
        if not os.path.exists(config_path):
            print(f"Error: config file not found: {config_path}")
            sys.exit(1)
        try:
            r_il, t_il = load_lidar_to_imu_extrinsics(config_path)
            print(f"Loaded LiDAR->IMU extrinsics from {config_path}")
        except Exception as exc:
            print(f"Error loading extrinsics: {exc}")
            sys.exit(1)
    else:
        r_il = t_il = None
    
    # Check input files
    poses_file = os.path.join(input_dir, 'lidar_poses.txt')
    if not os.path.exists(poses_file):
        print(f"Error: lidar_poses.txt not found in {input_dir}")
        sys.exit(1)
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    pcd_output_dir = os.path.join(output_dir, 'pcd')
    
    # Clean existing pcd directory
    if os.path.exists(pcd_output_dir):
        shutil.rmtree(pcd_output_dir)
    os.makedirs(pcd_output_dir)
    
    # Convert poses and get timestamps
    print(f"Reading poses from {poses_file}...")
    all_timestamps = []
    all_poses = []
    
    with open(poses_file, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) != 8:
                continue
            
            timestamp = parts[0]
            tx, ty, tz = float(parts[1]), float(parts[2]), float(parts[3])
            qx, qy, qz, qw = float(parts[4]), float(parts[5]), float(parts[6]), float(parts[7])

            if pose_frame == 'lidar':
                tx, ty, tz, qx, qy, qz, qw = transform_imu_to_lidar_pose(
                    tx, ty, tz, qx, qy, qz, qw, r_il, t_il
                )

            all_timestamps.append(timestamp)
            # FAST-LOCALIZATION format: tx ty tz qw qx qy qz
            all_poses.append([tx, ty, tz, qw, qx, qy, qz])
    
    # Apply step for keyframe selection
    selected_timestamps = all_timestamps[::step]
    selected_poses = all_poses[::step]
    
    print(f"Total frames: {len(all_timestamps)}, Selected keyframes: {len(selected_timestamps)} (step={step})")
    
    # Save pose.json (plain text format: tx ty tz qw qx qy qz per line)
    # Note: Despite the .json extension, HBA/FAST-LOCALIZATION expects plain text format
    pose_json_file = os.path.join(output_dir, 'pose.json')
    with open(pose_json_file, 'w') as f:
        for pose in selected_poses:
            # Format: tx ty tz qw qx qy qz
            f.write(f"{pose[0]} {pose[1]} {pose[2]} {pose[3]} {pose[4]} {pose[5]} {pose[6]}\n")
    print(f"Saved {len(selected_poses)} poses to {pose_json_file}")
    
    # Convert PCD files (XYZRGB -> XYZI format)
    print(f"Converting PCD files (XYZRGB -> XYZI format)...")
    converted_count = 0
    missing_count = 0
    
    for idx, ts in enumerate(selected_timestamps):
        input_file = os.path.join(input_dir, f"{ts}.pcd")
        output_file = os.path.join(pcd_output_dir, f"{idx}.pcd")
        
        if os.path.exists(input_file):
            try:
                convert_pcd_rgb_to_intensity(input_file, output_file)
                converted_count += 1
                if (idx + 1) % 100 == 0:
                    print(f"  Processed {idx + 1}/{len(selected_timestamps)} files...")
            except Exception as e:
                print(f"Error converting {input_file}: {e}")
                missing_count += 1
        else:
            print(f"Warning: PCD file not found: {input_file}")
            missing_count += 1
    
    print(f"\n=== Conversion Complete ===")
    print(f"Output directory: {output_dir}")
    print(f"  - pcd/: {converted_count} PCD files (0.pcd to {converted_count-1}.pcd)")
    print(f"  - pose.json: {len(selected_poses)} poses")
    print(f"  - PCD format: XYZI (x, y, z, intensity)")
    if missing_count > 0:
        print(f"  - Warning: {missing_count} PCD files failed or missing")
    
    print(f"\nTo use with FAST-LOCALIZATION, set map_path to: {output_dir}")
    
    # Verify output format
    if converted_count > 0:
        first_output = os.path.join(pcd_output_dir, "0.pcd")
        header, _ = read_pcd_header(first_output)
        print(f"\nOutput PCD format verification:")
        print(f"  FIELDS: {header.get('FIELDS', 'N/A')}")
        print(f"  POINTS: {header.get('POINTS', 'N/A')}")


if __name__ == '__main__':
    main()
