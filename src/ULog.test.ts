import path from "path";

import { ULog } from "./ULog";
import { MessageType } from "./enums";
import { MessageAddLogged, MessageDataParsed } from "./messages";
import { FileReader } from "./node/FileReader";

jest.setTimeout(1000 * 30);

describe("ULog sample.ulg", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "sample.ulg");

  it("open()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    const header = ulog.header!;

    expect(header.version).toBe(0);
    expect(header.timestamp).toBe(112500176n);
    expect(header.flagBits).toBeUndefined();

    expect(header.information.size).toBe(4);
    expect(header.information.get("ver_sw")).toBe("fd483321a5cf50ead91164356d15aa474643aa73");
    expect(header.information.get("ver_hw")).toBe("AUAV_X21");
    expect(header.information.get("sys_name")).toBe("PX4");
    expect(header.information.get("time_ref_utc")).toBe(0);

    expect(header.parameters.size).toEqual(493);
    expect(header.parameters.get("RC12_TRIM")).toEqual({ defaultTypes: 0, value: 1500 });
    expect(header.parameters.get("SENS_BARO_QNH")).toEqual({ defaultTypes: 0, value: 1013.25 });

    expect(header.definitions.size).toEqual(103);
    const esc_status = header.definitions.get("esc_status")!;
    expect(esc_status).toBeDefined();
    expect(esc_status.name).toBe("esc_status");
    expect(esc_status.fields).toHaveLength(6);
    const timestamp = esc_status.fields[0]!;
    expect(timestamp.name).toBe("timestamp");
    expect(timestamp.isComplex).toBe(false);
    expect(timestamp.type).toBe("uint64_t");
    const counter = esc_status.fields[1]!;
    expect(counter.name).toBe("counter");
    expect(counter.isComplex).toBe(false);
    expect(counter.type).toBe("uint16_t");
    const esc_count = esc_status.fields[2]!;
    expect(esc_count.name).toBe("esc_count");
    expect(esc_count.isComplex).toBe(false);
    expect(esc_count.type).toBe("uint8_t");
    const esc_connectiontype = esc_status.fields[3]!;
    expect(esc_connectiontype.name).toBe("esc_connectiontype");
    expect(esc_connectiontype.isComplex).toBe(false);
    expect(esc_connectiontype.type).toBe("uint8_t");
    const padding0 = esc_status.fields[4]!;
    expect(padding0.name).toBe("_padding0");
    expect(padding0.isComplex).toBe(false);
    expect(padding0.type).toBe("uint8_t");
    expect(padding0.arrayLength).toBe(4);
    const esc = esc_status.fields[5]!;
    expect(esc.name).toBe("esc");
    expect(esc.isComplex).toBe(true);
    expect(esc.type).toBe("esc_report");
    expect(esc.arrayLength).toBe(8);

    void reader.close();
  });

  it("readMessages()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    let prevTimestamp = 0n;
    for await (const msg of ulog.readMessages()) {
      if (msg.type === MessageType.Data) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(msg.value.timestamp).toBeGreaterThanOrEqual(prevTimestamp);
        prevTimestamp = msg.value.timestamp;
      } else if (msg.type === MessageType.Log || msg.type === MessageType.LogTagged) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(msg.timestamp).toBeGreaterThanOrEqual(prevTimestamp);
        prevTimestamp = msg.timestamp;
      }
    }

    void reader.close();
  });

  it("MessageAddLogged", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    let subscribe: MessageAddLogged | undefined;
    for await (const msg of ulog.readMessages()) {
      if (msg.type === MessageType.AddLogged) {
        subscribe = msg;
        break;
      }
    }

    expect(subscribe).toBeDefined();
    expect(subscribe!.type).toBe(MessageType.AddLogged);
    expect(subscribe!.size).toBe(19);
    expect(subscribe!.multiId).toBe(0);
    expect(subscribe!.msgId).toBe(0);
    expect(subscribe!.messageName).toBe("vehicle_attitude");

    void reader.close();
  });

  it("MessageDataParsed", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    let data: MessageDataParsed | undefined;
    for await (const msg of ulog.readMessages()) {
      if (msg.type === MessageType.Data && msg.msgId === 0) {
        data = msg;
        break;
      }
    }

    expect(data).toBeDefined();
    expect(data!.type).toBe(MessageType.Data);
    expect(data!.size).toBe(38);
    expect(data!.msgId).toBe(0);
    expect(data!.data.byteLength).toBe(36);
    expect(data!.data[0]).toBe(99);
    expect(data!.data[data!.data.byteLength - 1]).toBe(190);
    expect(data!.value).toEqual({
      timestamp: 112574307n,
      rollspeed: -0.0004259266424924135,
      pitchspeed: 0.000473720021545887,
      yawspeed: 0.0008371851872652769,
      q: [0.9545906186103821, 0.041478633880615234, 0.048174899071455, -0.2910595238208771],
    });

    void reader.close();
  });
});

describe("ULog sample_appended.ulg", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "sample_appended.ulg");

  it("open()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    const header = ulog.header!;

    expect(header.version).toBe(1);
    expect(header.timestamp).toBe(5115156n);
    expect(header.flagBits).toEqual({
      appendedOffsets: [4530735n, 0n, 0n],
      compatibleFlags: [0, 0, 0, 0, 0, 0, 0, 0],
      incompatibleFlags: [1, 0, 0, 0, 0, 0, 0, 0],
      size: 40,
      type: 66,
    });

    expect(header.information.size).toBe(47);
    expect(Object.fromEntries(header.information)).toEqual({
      ver_sw: "f54a6c2999e1e2fcbf56dd89de06b615b4186a6e",
      ver_sw_release: 17170432,
      ver_hw: "PX4FMU_V4",
      sys_name: "PX4",
      sys_os_name: "NuttX",
      ver_sw_branch: "ulog_crash_dump",
      sys_os_ver: "8b81cf5c7ece0c228eaaea3e9d8e667fc4d21a06",
      sys_os_ver_release: 192,
      sys_toolchain: "GNU GCC",
      sys_toolchain_ver: "5.4.1 20160919 (release) [ARM/embedded-5-branch revision 240496]",
      sys_mcu: "STM32F42x, rev. 3",
      sys_uuid: "004F00413335510D30383336",
      time_ref_utc: 0,
      "perf_counter_preflight-00":
        "navigator: 3 events, 80us elapsed, 26us avg, min 25us max 28us 1.528us rms",
      "perf_counter_preflight-01":
        "mc_att_control: 766 events, 38087us elapsed, 49us avg, min 23us max 395us 32.174us rms",
      "perf_counter_preflight-02":
        "logger_sd_fsync: 0 events, 0us elapsed, 0us avg, min 0us max 0us 0.000us rms",
      "perf_counter_preflight-03":
        "logger_sd_write: 3 events, 72442us elapsed, 24147us avg, min 10us max 36356us 20904.014us rms",
      "perf_counter_preflight-04": "mavlink_txe: 226 events",
      "perf_counter_preflight-05":
        "mavlink_el: 1016 events, 163693us elapsed, 161us avg, min 84us max 2478us 191.598us rms",
      "perf_counter_preflight-06": "mavlink_txe: 0 events",
      "perf_counter_preflight-07":
        "mavlink_el: 286 events, 33394us elapsed, 116us avg, min 46us max 1851us 166.045us rms",
      "perf_counter_preflight-08": "mavlink_txe: 0 events",
      "perf_counter_preflight-09":
        "mavlink_el: 318 events, 48587us elapsed, 152us avg, min 66us max 2327us 259.293us rms",
      "perf_counter_preflight-10": "mavlink_txe: 0 events",
      "perf_counter_preflight-11":
        "mavlink_el: 1030 events, 214017us elapsed, 207us avg, min 79us max 4163us 310.871us rms",
      "perf_counter_preflight-12":
        "ctl_lat: 321 events, 13187us elapsed, 41us avg, min 38us max 111us 11.183us rms",
      "perf_counter_preflight-13":
        "stack_check: 7 events, 69us elapsed, 9us avg, min 2us max 16us 4.488us rms",
      "perf_counter_preflight-14":
        "sensors: 826 events, 93853us elapsed, 113us avg, min 65us max 5118us 179.764us rms",
      "perf_counter_preflight-15":
        "ctrl_latency: 321 events, 40037us elapsed, 124us avg, min 103us max 3022us 166.815us rms",
      "perf_counter_preflight-16": "mpu9250_dupe: 898 events",
      "perf_counter_preflight-17": "mpu9250_reset: 0 events",
      "perf_counter_preflight-18": "mpu9250_good_trans: 3443 events",
      "perf_counter_preflight-19": "mpu9250_bad_reg: 0 events",
      "perf_counter_preflight-20": "mpu9250_bad_trans: 0 events",
      "perf_counter_preflight-21":
        "mpu9250_read: 4342 events, 269357us elapsed, 62us avg, min 41us max 91us 13.632us rms",
      "perf_counter_preflight-22": "mpu9250_gyro_read: 0 events",
      "perf_counter_preflight-23": "mpu9250_acc_read: 2 events",
      "perf_counter_preflight-24": "mpu9250_mag_duplicates: 3066 events",
      "perf_counter_preflight-25": "mpu9250_mag_overflows: 0 events",
      "perf_counter_preflight-26": "mpu9250_mag_overruns: 51 events",
      "perf_counter_preflight-27": "mpu9250_mag_errors: 0 events",
      "perf_counter_preflight-28": "mpu9250_mag_reads: 0 events",
      "perf_counter_preflight-29":
        "adc_samples: 3024 events, 8046us elapsed, 2us avg, min 2us max 3us 0.474us rms",
      "perf_counter_preflight-30": "ms5611_com_err: 0 events",
      "perf_counter_preflight-31":
        "ms5611_measure: 321 events, 5603us elapsed, 17us avg, min 8us max 679us 54.355us rms",
      "perf_counter_preflight-32":
        "ms5611_read: 320 events, 23168us elapsed, 72us avg, min 13us max 543us 49.197us rms",
      "perf_counter_preflight-33": "dma_alloc: 4 events",
    });

    expect(header.parameters.size).toEqual(713);
    expect(header.parameters.get("RC12_TRIM")).toEqual({ defaultTypes: 0, value: 1500 });
    expect(header.parameters.get("SENS_BARO_QNH")).toEqual({ defaultTypes: 0, value: 1013.25 });

    expect(header.definitions.size).toEqual(110);
    const esc_status = header.definitions.get("esc_status")!;
    expect(esc_status).toBeDefined();
    expect(esc_status.name).toBe("esc_status");
    expect(esc_status.fields).toHaveLength(6);
    const timestamp = esc_status.fields[0]!;
    expect(timestamp.name).toBe("timestamp");
    expect(timestamp.isComplex).toBe(false);
    expect(timestamp.type).toBe("uint64_t");
    const counter = esc_status.fields[1]!;
    expect(counter.name).toBe("counter");
    expect(counter.isComplex).toBe(false);
    expect(counter.type).toBe("uint16_t");
    const esc_count = esc_status.fields[2]!;
    expect(esc_count.name).toBe("esc_count");
    expect(esc_count.isComplex).toBe(false);
    expect(esc_count.type).toBe("uint8_t");
    const esc_connectiontype = esc_status.fields[3]!;
    expect(esc_connectiontype.name).toBe("esc_connectiontype");
    expect(esc_connectiontype.isComplex).toBe(false);
    expect(esc_connectiontype.type).toBe("uint8_t");
    const padding0 = esc_status.fields[4]!;
    expect(padding0.name).toBe("_padding0");
    expect(padding0.isComplex).toBe(false);
    expect(padding0.type).toBe("uint8_t");
    expect(padding0.arrayLength).toBe(4);
    const esc = esc_status.fields[5]!;
    expect(esc.name).toBe("esc");
    expect(esc.isComplex).toBe(true);
    expect(esc.type).toBe("esc_report");
    expect(esc.arrayLength).toBe(8);

    void reader.close();
  });
});

describe("log_6_2021-7-20-11-41-56.ulg", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "log_6_2021-7-20-11-41-56.ulg");

  it("should parse", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    expect(ulog.messageCount()).toBe(1023911);

    await reader.close();
  });
});

describe("truncated.ulg", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "truncated.ulg");

  it("should parse", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    expect(ulog.messageCount()).toBe(187433);

    await reader.close();
  });
});

describe("README.md", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "sample.ulg");

  it("example code works", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open(); // required before any other operations
    expect(ulog.messageCount()).toBe(64599); // ex: 64599
    expect(ulog.timeRange()).toEqual([112574307n, 181493506n]);

    const msgIdCounts = new Map<number, number>();
    for await (const msg of ulog.readMessages()) {
      if (msg.type === MessageType.Data) {
        // NOTE: `msg.value` holds the deserialized message
        msgIdCounts.set(msg.msgId, (msgIdCounts.get(msg.msgId) ?? 0) + 1);
      }
    }
    const msgCounts = Object.fromEntries(
      Array.from(msgIdCounts.entries()).map(([id, count]) => [
        ulog.subscriptions.get(id)!.name,
        count,
      ]),
    );
    expect(msgCounts).toEqual({
      vehicle_attitude: 6461,
      actuator_outputs: 1311,
      telemetry_status: 70,
      vehicle_status: 294,
      commander_state: 678,
      vehicle_attitude_setpoint: 3272,
      vehicle_rates_setpoint: 6448,
      actuator_controls_0: 3269,
      vehicle_local_position: 678,
      ekf2_innovations: 3271,
      sensor_preflight: 17072,
      sensor_combined: 17070,
      control_state: 3268,
      estimator_status: 1311,
      cpuload: 69,
    });

    await reader.close();
  });
});
