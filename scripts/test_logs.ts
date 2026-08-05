import { ProtocolService } from './src/services/protocolService.js';
async function run() {
  await ProtocolService.getProtocolState();
}
run();
