export enum MessageType {
  FlagBits = 0x42, // 'B'
  Information = 0x49, // 'I'
  FormatDefinition = 0x46, // 'F'
  InformationMulti = 0x4d, // 'M'
  Parameter = 0x50, // 'P'
  ParameterDefault = 0x51, // 'Q'
  AddLogged = 0x41, // 'A'
  RemoveLogged = 0x52, // 'R'
  Data = 0x44, // 'D'
  Log = 0x4c, // 'L'
  LogTagged = 0x43, // 'C'
  Synchronization = 0x53, // 'S'
  Dropout = 0x4f, // 'O'
}

export enum CompatibleFlags {
  DefaultParameters = 1,
}

export enum IncompatibleFlags {
  AppendedData = 1,
}

export enum ParameterDefaultFlags {
  SystemWide = 1 << 0,
  CurrentConfigurationDefault = 1 << 1,
}

export enum LogLevel {
  Emerg = 0, // System is unusable
  Alert = 1, // Action must be taken immediately
  Crit = 2, // Critical conditions
  Err = 3, // Error conditions
  Warning = 4, // Warning conditions
  Notice = 5, // Normal but significant condition
  Info = 6, // Informational
  Debug = 7, // Debug-level messages
}

export type BuiltinType =
  | "int8_t"
  | "uint8_t"
  | "int16_t"
  | "uint16_t"
  | "int32_t"
  | "uint32_t"
  | "int64_t"
  | "uint64_t"
  | "float"
  | "double"
  | "bool"
  | "char";

/**
 * Well-known key names for Information 'I' messages
 */
export type InformationKey =
  | "sys_name" // Name of the system, ex: "PX4"
  | "ver_hw" //	Hardware version (board), ex: "PX4FMU_V4"
  | "ver_hw_subtype" //	Board subversion (variation), ex: "V2"
  | "ver_sw" //	Software version (git tag), ex: "7f65e01"
  | "ver_sw_branch" //	git branch, ex: "master"
  | "ver_sw_release" // Software version, ex: 0x010401ff
  | "sys_os_name" // Operating System Name, ex: "Linux"
  | "sys_os_ver" // OS version (git tag), ex: "9f82919"
  | "ver_os_release" // OS version, ex: 0x010401ff
  | "sys_toolchain" // Toolchain Name, ex: "GNU GCC"
  | "sys_toolchain_ver" // Toolchain Version, ex: "6.2.1"
  | "sys_mcu" // Chip name and revision, ex: "STM32F42x, rev A"
  | "sys_uuid" // Unique identifier for vehicle (eg. MCU ID), ex: "392a93e32fa3"...
  | "log_type" // Type of the log (full log if not specified), ex: "mission"
  | "replay" // File name of replayed log if in replay mode, ex: "log001.ulg"
  | "time_ref_utc"; // UTC Time offset in seconds, ex: -3600
