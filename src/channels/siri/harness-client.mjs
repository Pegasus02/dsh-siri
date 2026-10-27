import { HarnessClient } from '../shared/harness-client.mjs';

export class SiriHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'siri',
      logPrefix: 'dsh-siri',
    });
  }
}
