import qrcode from 'qrcode-generator';

/** Encodes the actual same-origin invitation; four clear modules are added by
 * the renderer. Generation never contacts a remote service. */
export function invitationMatrix(url: string): boolean[][] {
  const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
  return Array.from({ length: code.getModuleCount() }, (_, y) => Array.from({ length: code.getModuleCount() }, (_, x) => code.isDark(y, x)));
}
export function renderInvitationQr(canvas: HTMLCanvasElement, url: string): void {
  const matrix = invitationMatrix(url), cell = 6, border = 4;
  canvas.width = canvas.height = (matrix.length + border * 2) * cell;
  const context = canvas.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000000';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) context.fillRect((x + border) * cell, (y + border) * cell, cell, cell); }));
}
