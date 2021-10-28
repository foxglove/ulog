# @foxglove/ulog

> _PX4 ULog file reader_

A web and node.js TypeScript library for reading [PX4 ULog](https://docs.px4.io/master/en/dev_log/ulog_file_format.html) files, from the PX4 Autopilot system for drones and other autonomous vehicles.

## Usage

```typescript
import { MessageType, ULog } from "@foxglove/ulog";
import { FileReader } from "@foxglove/ulog/node";

async function main() {
  const ulog = new ULog(new FileReader("../path/to/file.ulg"));
  await ulog.open(); // required before any other operations
  console.log(ulog.messageCount()); // ex: 64599
  console.log(ulog.timeRange()); // ex: [ 0n, 181493506n ]

  // build a map of subscription ids to message counts
  // NOTE: readMessages() iterates over DATA section messages in timestamp order
  const msgIdCounts = new Map<number, number>();
  for await (const msg of ulog.readMessages()) {
    if (msg.type === MessageType.Data) {
      // NOTE: `msg.value` holds the deserialized message
      msgIdCounts.set(msg.msgId, (msgIdCounts.get(msg.msgId) ?? 0) + 1);
    }
  }

  // convert the subscription ids to message names
  const msgCounts = Array.from(msgIdCounts.entries()).map(([id, count]) => [
    ulog.subscriptions.get(id)?.name ?? `unknown msg_id ${id}`,
    count,
  ]);
  console.log(msgCounts);
  // ex: [ [ 'vehicle_attitude', 6461 ], [ 'actuator_outputs', 1311 ], ... ]
}

void main();
```

## License

@foxglove/ulog is licensed under [MIT License](https://opensource.org/licenses/MIT).

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Stay in touch

Join our [Slack channel](https://foxglove.dev/join-slack) to ask questions, share feedback, and stay up to date on what our team is working on.
