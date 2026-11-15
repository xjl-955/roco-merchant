/**
 * 离愁轩孵蛋 API 客户端（小程序直连）
 * 加密：SHA256("lcx.cab") 为密钥的 16 字节 XOR 链式，前 16 字节即密钥前缀
 * 返回 { matched, others } 或 null
 */
var KEY = [78, 173, 172, 38, 17, 99, 169, 131, 154, 196, 154, 87, 135, 2, 24, 75];
var SIGN_URL = 'https://wiki.lcx.cab/lk/api/sign_api.php';
var PREDICT_URL = 'https://wiki.lcx.cab/lk/api/egg_predict_api.php';
var IMG_BASE = 'https://wiki.lcx.cab/lk/imgs/';

function b64ToBytes(b64) {
  var s = String(b64).replace(/[\r\n\s]/g, '');
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = [];
  var buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === '=') break;
    var v = chars.indexOf(c);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xFF); }
  }
  return out;
}

function bytesToB64(bytes) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += chars.charAt(b0 >> 2);
    out += chars.charAt(((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4));
    out += b1 === undefined ? '=' : chars.charAt(((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6));
    out += b2 === undefined ? '=' : chars.charAt(b2 & 63);
  }
  return out;
}

function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    else {
      c -= 0x10000;
      out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
  }
  return out;
}

function bytesToUtf8(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length;) {
    var b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i++; }
    else if (b < 0xE0) { out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 2; }
    else if (b < 0xF0) { out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 3; }
    else {
      var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
      cp -= 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      i += 4;
    }
  }
  return out;
}

function randomIv() {
  var iv = [];
  for (var i = 0; i < 16; i++) iv.push(Math.floor(Math.random() * 256));
  return iv;
}

function encrypt(plain) {
  var bytes = utf8Bytes(plain);
  var pad = 16 - (bytes.length % 16);
  for (var p = 0; p < pad; p++) bytes.push(pad);
  var iv = randomIv();
  var out = iv.slice();
  var prev = iv.slice();
  for (var a = 0; a < bytes.length; a += 16) {
    var block = bytes.slice(a, a + 16);
    for (var h = 0; h < 16; h++) block[h] ^= KEY[h];
    for (var s = 0; s < 16; s++) block[s] ^= prev[s];
    for (var k = 0; k < block.length; k++) out.push(block[k]);
    prev = block.slice();
  }
  return bytesToB64(out);
}

function decrypt(b64) {
  var buf = b64ToBytes(b64);
  if (buf.length < 32) return null;
  var iv = buf.slice(0, 16);
  var data = buf.slice(16);
  var out = [];
  var prev = iv.slice();
  for (var a = 0; a < data.length; a += 16) {
    var block = data.slice(a, a + 16);
    var cipherCopy = block.slice();
    for (var h = 0; h < 16; h++) block[h] ^= KEY[h];
    for (var s = 0; s < 16; s++) block[s] ^= prev[s];
    for (var k = 0; k < block.length; k++) out.push(block[k]);
    prev = cipherCopy;
  }
  var pad = out[out.length - 1];
  if (pad < 1 || pad > 16) pad = 0;
  return bytesToUtf8(out.slice(0, out.length - pad));
}

function toNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function mapResult(json) {
  var matched = (json.pokemons || []).map(function (p) {
    var prob = toNum(p.prob) * 100;
    var imgName = p.imageName || p.name || '';
    return {
      name: (p.name || '') + (p.form_name || ''),
      pic: IMG_BASE + encodeURIComponent(imgName) + '.webp',
      key: (p.t_id || '') + '_' + (p.name || ''),
      range: '蛋高 ' + p.egg_diameter + 'm · 蛋重 ' + p.egg_weight + 'kg',
      prob: prob,
      probText: prob >= 0.01 ? prob.toFixed(2) + '%' : (prob > 0 ? '<0.01%' : '0%'),
      label: prob >= 70 ? '极有可能' : prob >= 40 ? '很可能' : prob >= 15 ? '可能' : '较低'
    };
  });
  var others = (json.random_egg_not_appear || []).map(function (p) {
    var imgName = p.imageName || p.name || '';
    return {
      name: (p.name || '') + (p.form_name || ''),
      pic: IMG_BASE + encodeURIComponent(imgName) + '.webp',
      range: '蛋高 ' + p.egg_diameter + 'm · 蛋重 ' + p.egg_weight + 'kg'
    };
  });
  return { matched: matched, others: others };
}

/**
 * 直连查询。callback(result, errMsg)
 * result = { matched, others }
 */
function predict(size, weight, callback) {
  var d;
  try {
    d = encrypt(size + '|' + weight + '|' + Math.floor(Date.now() / 1000));
  } catch (e) {
    callback(null, 'encrypt_fail');
    return;
  }
  wx.request({
    url: SIGN_URL,
    method: 'POST',
    header: { 'content-type': 'application/json' },
    timeout: 12000,
    data: { params: encodeURIComponent(JSON.stringify({ action: 'predict', d: d, show_details: false })) },
    success: function (res) {
      var sign = res.data && res.data.sign;
      if (!sign) { callback(null, 'sign_fail:' + JSON.stringify(res.data || {}).slice(0, 80)); return; }
      wx.request({
        url: PREDICT_URL,
        method: 'GET',
        timeout: 15000,
        data: { action: 'predict', d: d, show_details: 0, sign: sign, is_mini: 1 },
        success: function (r2) {
          var body = r2.data;
          var json = null;
          if (typeof body === 'string') {
            try { json = JSON.parse(decrypt(body)); } catch (e) { try { json = JSON.parse(body); } catch (e2) { json = null; } }
          } else { json = body; }
          if (!json) { callback(null, 'decode_fail'); return; }
          if (!json.success) { callback(null, 'api:' + (json.error || 'unknown')); return; }
          callback(mapResult(json), '');
        },
        fail: function (e) { callback(null, 'predict_net:' + (e && e.errMsg ? e.errMsg : '')); }
      });
    },
    fail: function (e) { callback(null, 'sign_net:' + (e && e.errMsg ? e.errMsg : '')); }
  });
}

module.exports = { predict: predict, encrypt: encrypt, decrypt: decrypt };
