import { SHARED_CSS } from './shared-css.js';
export const SIRI_STYLE_ID = 'xmanrui-dsh-im-siri-settings';
const CSS = String.raw`
.dsiri-page, .dim-pageSiri { --dim-blue: var(--dsw-alias-state-business-primary, #3370ff); --dim-blue-soft: color-mix(in srgb, var(--dim-blue) 9%, transparent); }
.dsiri-card { border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dsiri-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dsiri-button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0 13px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 560; cursor: pointer; }
.dsiri-button:hover:not(:disabled) { border-color: var(--dim-blue); }
.dsiri-button[data-kind="primary"] { color: #fff; background: var(--dim-blue); border-color: var(--dim-blue); }
.dsiri-button:disabled { opacity: .5; cursor: not-allowed; }
.dsiri-input { width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); background: transparent; color: inherit; font: inherit; resize: vertical; }
.dsiri-page { display: grid; gap: 14px; padding: 20px 16px 32px; max-width: 820px; margin: 0 auto; }
.dsiri-sectionHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dsiri-sectionHead h3 { margin: 0; }
.dsiri-pill { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 560; color: var(--dim-blue); background: var(--dim-blue-soft); }
.dsiri-banner { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--dim-blue-soft); border: 1px solid color-mix(in srgb, var(--dim-blue) 25%, transparent); font-size: 13px; line-height: 1.55; }
.dsiri-banner span { color: var(--dsw-alias-label-secondary, #646a73); }
.dsiri-env { display: grid; gap: 8px; }
.dsiri-env[data-overridden="true"] { opacity: .5; pointer-events: none; filter: grayscale(.4); user-select: none; }
.dim-siriPanel h3 { font-size: 15px; font-weight: 600; }
.dim-siriPanel { padding: 18px 20px; gap: 14px; }
nd: linear-gradient(135deg, #5e5ce6 0%, #bf5af2 50%, #ff375f 100%); box-shadow: inset 0 1px 1px rgb(255 255 255 / 45%), 0 1px 3px rgb(31 35 41 / 12%); }

.dim-pageSiri { --ddt-accent: #7d5cf0; --ddt-accent-deep: #6244d6; --ddt-accent-wash: #f3f0ff; }
.dim-siriPanel { display: grid; }
.dim-siriPanel h3 { margin: 0; }
.dim-siriPanel p, .dim-siriHint { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.6; }
.dim-siriState { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
.dim-siriDot { width: 9px; height: 9px; border-radius: 50%; background: #9aa0a6; }
.dim-siriDot[data-ok="true"] { background: #2eb85c; }
.dim-siriDot[data-ok="false"] { background: #e5484d; }
.dim-siriRow { display: grid; gap: 6px; }
.dim-siriRow > label { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); }
.dim-siriValue { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dim-siriValue code { padding: 6px 10px; border-radius: 6px; background: rgb(127 127 127 / 12%); word-break: break-all; user-select: all; }
.dim-siriFields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.dim-siriFields input { width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 6px; border: 1px solid rgb(127 127 127 / 35%); background: transparent; color: inherit; }
.dim-siriSteps { margin: 0; padding-left: 20px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.8; }
.dim-siriError { color: #e5484d; font-size: 13px; }
`;
export function installSiriStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${SIRI_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style'); style.dataset.plugin = '@xmanrui/dsh-im';
  style.dataset.pluginCss = SIRI_STYLE_ID; style.textContent = CSS + SHARED_CSS; document.head.appendChild(style);
  return () => style.remove();
}
