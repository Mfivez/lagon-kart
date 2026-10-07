import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { invitationMatrix } from '../client/invitation-qr.js';
import { invitationUrl } from '../client/invitation-link.js';

test('invitation QR decodes to the real same-origin room URL, including a long HTTPS tunnel', () => {
  for (const origin of ['http://localhost:3000', 'https://miles-blades-tulsa-citizens.trycloudflare.com']) {
    const url = invitationUrl(origin, 'ABC234'), matrix = invitationMatrix(url), scale = 6, border = 4, size = (matrix.length + border * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4); pixels.fill(255);
    matrix.forEach((row, y) => row.forEach((black, x) => {
      if (!black) return;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const index = (((y + border) * scale + dy) * size + (x + border) * scale + dx) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
      }
    }));
    assert.equal(jsQR(pixels, size, size)?.data, `${origin}/room/ABC234`);
  }
});

test('room invitation only uses an HTTP origin and a valid room code', () => {
  assert.equal(invitationUrl('https://example.com/old?token=secret', 'AB_2-x'), 'https://example.com/room/AB_2-x');
  assert.throws(() => invitationUrl('https://example.com', '../other')); assert.throws(() => invitationUrl('javascript:alert(1)', 'ROOM'));
});
