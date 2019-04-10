import { Neovim, Buffer, Window } from 'neovim';
import { leftpad } from './utils';

const createBuffer = async (nvim: Neovim) =>
  await nvim.createBuffer(false, false);
const popupWindowSize = (contents: string[]): [number, number] => {
  let width = 0;
  let max_width = 100;
  let height = 0;

  for (let line of contents) {
    let lw = line.length;
    if (lw > width) {
      if (lw > max_width) {
        height += lw / max_width + 1;
        width = max_width;
      }
      width = lw;
    }
    height++;
  }
  width++;
  return [Math.round(width), Math.round(height)];
};
const getWindowPos = async (
  nvim: Neovim,
  width: number,
  height: number,
  error: protocol.Diagnostic
): Promise<any> => {
  const [line, offset] = await nvim.window.cursor;
  const lastLine = await nvim.window.height;
  const coluns = await nvim.window.width;

  let vert = '';
  let hor = '';
  let row = 0;
  let col = 0;
  if (line + height <= lastLine) {
    vert = 'N';
    row = 1;
  } else {
    vert = 'S';
    row = 0;
  }
  if (offset + width <= coluns) {
    hor = 'W';
  } else {
    hor = 'E';
  }
  col = error.start.offset - offset - 1;
  const anchor = vert + hor;

  return {
    relative: 'cursor',
    anchor: anchor,
    row: row,
    col: col
  };
};
const setOptions = async (
  nvim: Neovim,
  floatingWindow: Window,
  buffer: Buffer
) => {
  return Promise.all([
    buffer.setOption('filetype', 'nvimtypescriptpopup'),
    floatingWindow.setOption('signcolumn', 'no'),
    floatingWindow.setOption('number', false),
    floatingWindow.setOption('relativenumber', false),
    buffer.setOption('buftype', 'nofile'),
    buffer.setOption('bufhidden', 'wipe'),
    buffer.setOption('modifiable', false),
    floatingWindow.setOption('cursorline', false),
    floatingWindow.setOption('wrap', true),
    floatingWindow.setOption('foldenable', false),
    floatingWindow.setOption('spell', false),

    floatingWindow.setOption(
      'winhighlight',
      'Normal:nvimTypescriptPopupNormal,EndOfBuffer:nvimTypescriptEndOfBuffer'
    )
  ]);
};
export const createFloatingWindow = async (
  nvim: Neovim,
  symbol: any
): Promise<Window> => {
  const buffer = (await createBuffer(nvim)) as Buffer;
  let text: string[] = symbol.text.split('\n').map((e: string, idx: number) => {
    if (idx === 0) {
      return leftpad(
        `${symbol.source ? '[' + symbol.source + ']: ' : ''}${e}`,
        1
      );
    }
    return leftpad(e, 1);
  });

  const [width, height] = popupWindowSize(text);
  const windowPos = await getWindowPos(nvim, width, height, symbol);
  await buffer.setLines(text, { start: 0, end: -1, strictIndexing: false });
  const options = Object.assign({}, windowPos, {
    height: height,
    width: width
  });
  console.warn(JSON.stringify(options));
  const floatingWindow = (await nvim.openWindow(
    buffer,
    false,
    options
  )) as Window;
  await setOptions(nvim, floatingWindow, buffer);
  return floatingWindow;
};
