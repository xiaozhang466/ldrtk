# Motor action completion message
# Published when a motor action completes

uint8 action_id        # Action ID that completed (0-8)
uint8 status           # Status: 0=failed, 1=success, 2=timeout
uint8 completion_signal # Completion signal value read from Modbus (0=not complete, 1=complete)
string error_message   # Error message if status is failed
time timestamp         # Timestamp of completion
