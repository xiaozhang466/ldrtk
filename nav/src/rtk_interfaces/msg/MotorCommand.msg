# Motor control command message
# Used to control motor actions via RS485 Modbus protocol

uint8 action_id        # Action ID (0-8 corresponding to D0-D8)
uint8 action_type      # Action type: 0=stop, 1=start, 2=emergency_stop
uint32 duration        # Duration in milliseconds (0 for indefinite)
string description     # Action description
