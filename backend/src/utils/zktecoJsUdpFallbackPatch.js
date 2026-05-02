'use strict';

/**
 * zkteco-js `createSocket`: on TCP failure it checks `err.code === 'ECONNREFUSED'`, but the inner
 * `catch` throws `new ZkError(err, ...)` first — the wrapper has no `.code`, so UDP fallback never runs.
 * This patch retries the same UDP path the library intended (see node_modules/zkteco-js/index.js).
 */
const ZktecoJs = require('zkteco-js');

function digNodeSystemError(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (obj.code && (obj.syscall || obj.address != null || obj.port != null)) return obj;
  if (obj.err) return digNodeSystemError(obj.err, depth + 1);
  return null;
}

function rootErrorCode(e) {
  const sys = digNodeSystemError(e);
  if (sys && sys.code) return String(sys.code);
  if (e && typeof e === 'object' && e.name === 'AggregateError' && Array.isArray(e.errors)) {
    for (const sub of e.errors) {
      const c = rootErrorCode(sub);
      if (c) return c;
    }
  }
  if (e && e.err && e.err.code) return String(e.err.code);
  if (e && e.code) return String(e.code);
  return null;
}

function applyPatch() {
  if (ZktecoJs.prototype.__hrZkCreateSocketUdpFallbackFix) return;
  const original = ZktecoJs.prototype.createSocket;

  ZktecoJs.prototype.createSocket = async function hrPatchedCreateSocket(cbErr, cbClose) {
    try {
      return await original.call(this, cbErr, cbClose);
    } catch (firstErr) {
      const code = rootErrorCode(firstErr);
      if (code !== 'ECONNREFUSED') throw firstErr;
      try {
        if (this.ztcp && this.ztcp.socket) {
          try {
            await this.ztcp.disconnect();
          } catch (_) { /* ignore */ }
        }
        if (!this.zudp.socket) {
          await this.zudp.createSocket(cbErr, cbClose);
        }
        await this.zudp.connect();
        this.connectionType = 'udp';
        return true;
      } catch (_udpErr) {
        throw firstErr;
      }
    }
  };

  ZktecoJs.prototype.__hrZkCreateSocketUdpFallbackFix = true;
}

module.exports = { applyPatch };
