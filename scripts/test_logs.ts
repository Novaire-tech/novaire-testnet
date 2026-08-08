import { ProtocolService } from '../apps/web/src/services/protocolService';
async function run() {
  await ProtocolService.getProtocolState();
}
run();
