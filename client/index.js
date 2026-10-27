// dsh-siri client: one settings section for the Siri voice entry.
import * as React from 'react';
import { callManagementRpc } from '../plugin-src/management-rpc.mjs';
import { SiriSettingsTab } from './panel.js';
import { SIRI_RPC_CHANNEL } from './api.js';
import { installSiriStyles } from './styles.js';

const h = React.createElement;

export const name = 'dsh-siri-settings';
export const inject = ['slots', 'connection', 'workspaces'];

export function apply(ctx) {
  ctx.effect(() => installSiriStyles(), 'dsh-siri: styles');
  const rpcCall = (endpoint, payload, signal) =>
    callManagementRpc(ctx.connection, SIRI_RPC_CHANNEL, endpoint, payload, signal);
  // Current DSH owns directory operations on uiWorkspace; legacy Hosts keep them on workspaces.
  const callDirectoryApi = (method, ...args) => {
    const uiWorkspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined;
    const service = typeof uiWorkspace?.[method] === 'function' ? uiWorkspace : ctx.workspaces;
    if (typeof service?.[method] !== 'function') throw new Error('无法读取目录，请重试。');
    return service[method](...args);
  };
  const directoryPicker = Object.freeze({
    listDirectory: (path, signal) => callDirectoryApi('listDirectory', path, signal),
    pickDirectory: () => callDirectoryApi('pickDirectory'),
  });
  // Stable component type: re-rendering the panel must not reset unsaved input.
  function SiriPanel() {
    return h('div', { className: 'dsiri-page' }, h(SiriSettingsTab, { rpcCall, directoryPicker }));
  }
  ctx.effect(() => ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'dsh-siri',
      order: 22,
      label: () => 'Siri 语音',
      inject: () => ({}),
    }, () => h(SiriPanel))), 'dsh-siri: settings section');
}
