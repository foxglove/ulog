# @foxglove/ulog

> _PX4 ULog file reader_

TODO

## Usage

```typescript
import { MessageType, ULog } from "@foxglove/ulog";
import { FileReader } from "@foxglove/ulog/node";

async function main() {
  const ulog = new ULog(new FileReader("../path/to/file.ulg"));
  await ulog.open(); // required before any other operations
  await ulog.createIndex(); // optional, but required before seeking
  console.log(ulog.messageCount()); // ex: 64599
  console.log(ulog.timeRange()); // ex: [ 0n, 181493506n ]

  const firstMessage = (await ulog.readMessage())!;
  // ex: { size: 19, type: MessageType.AddLogged, multiId: 0, msgId: 0,
  //       messageName: 'vehicle_attitude' }
  console.log(firstMessage);

  // seeks to the first message at or before the 500us timestamp
  ulog.seekToTime(500n);

  // build a map of subscription ids to message counts
  // NOTE: using the `.messages()` async iterator will enumerate all messages in
  // the DATA section, resetting the cursor after iteration is complete
  const msgIdCounts = new Map<number, number>();
  for await (const msg of ulog.messages()) {
    if (msg.type === MessageType.Data) {
      // NOTE: `msg.value` holds the deserialized message
      msgIdCounts.set(msg.msgId, (msgIdCounts.get(msg.msgId) ?? 0) + 1);
    }
  }

  // convert the subscription ids to message names
  const msgCounts = Array.from(msgIdCounts.entries()).map(([id, count]) => [
    ulog.subscriptions.get(id)!.name,
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
