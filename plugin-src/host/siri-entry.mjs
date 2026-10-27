// dsh-siri host entry: the Siri channel as a plugin of its own.
import { apply as applyChannel } from './channels/siri/index.mjs';

export const name = 'dsh-siri-host';
export const inject = ['connection', 'credentials', 'typertGateway'];

export async function apply(ctx, config = {}) {
  const start = (readyCtx) => applyChannel(readyCtx, config);
  // Same activation point as the IM channels: once the Session and workspace controllers exist.
  if (typeof ctx?.inject === 'function') {
    ctx.inject(['sessionController', 'workspaceController'], start);
    return;
  }
  return start(ctx);
}
