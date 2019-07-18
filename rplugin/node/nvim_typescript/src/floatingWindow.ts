import { Buffer, Neovim, Window } from 'neovim';
import { leftpad } from './utils';
import { OpenWindowOptions } from 'neovim/lib/api/Neovim';

const col = async (nvim: Neovim) => await nvim.window.width
const createBuffer = async (nvim: Neovim) => {
  console.warn("HERE?")
  return await nvim.createBuffer(false, false)
};
const processHoverText = (symbol: protocol.QuickInfoResponseBody) => {
  console.warn("SYMBOL", JSON.stringify(symbol));
  const text = symbol.displayString.split(/\r|\n/g).map(e => leftpad(e, 1, true));
  let sepLength = text[0].length;
  if (symbol.documentation !== '') {
    const docs = symbol.documentation.split(/\r|\n/g).map(e => leftpad(e, 1, true));
    let separatorLength = docs.reduce((a, b) => a.length > b.length ? a : b).length;
    if (separatorLength > sepLength) {
      sepLength = separatorLength
    }
    const sep = '—'.repeat(sepLength);
    text.push(sep, ...docs)
  }
  if (symbol.tags && symbol.tags.length > 0) {
    let tags = []

    symbol.tags.forEach(tag => {
      if (tag.name) {
        tags.push(`${leftpad('@' + tag.name, 1)}`);
      }
      if (tag.text) {
        tags.push(...tag.text.split(/\r|\n/g).filter(Boolean).map(e => leftpad(e, 1)))
      }
    })

    let separatorLength = tags.reduce((a, b) => a.length > b.length ? a : b).length;
    if (separatorLength > sepLength) {
      sepLength = separatorLength
    }
    const sep = '—'.repeat(sepLength);
    text.push(sep, ...tags)
  }

  console.warn('RETURNING ', JSON.stringify(text))
  return text;
}
const popupWindowSize = async (nvim: Neovim, contents: string[]): Promise<[number, number]> => {
  let width = 0;
  let colsize = await col(nvim);
  let max_width = Math.min(colsize, 80)
  let height = 0;
  for (let line of contents) {
    let lw = line.length;
    if (lw > width) {
      if (lw > max_width) {
        height += lw / max_width + 2;
        width = max_width;
      }
      width = lw;
    }
    height += 1;
  }
  return [Math.round(width), Math.round(height)];
};
const getWindowPos = async (nvim: Neovim, width: number, height: number, errorStart: protocol.Location): Promise<any> => {
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
  col = errorStart.offset - offset - 1;
  const anchor = vert + hor;

  return {
    relative: 'cursor',
    anchor: anchor,
    row: row,
    col: col
  };
};
const setBuffer = async (window: Window, buffer: Buffer, text: string[]) => {
  // return Promise.all([
  await window.setOption('winhl', 'Normal:nvimTypescriptPopupNormal,EndOfBuffer:nvimTypescriptEndOfBuffer')
  await buffer.setOption('filetype', 'nvimtypescriptpopup')
  await buffer.setOption('buftype', 'nofile')
  await buffer.setOption('bufhidden', 'wipe')
  await window.setOption('relativenumber', false)
  await window.setOption('signcolumn', 'no')
  await window.setOption('number', false)
  await window.setOption('cursorline', false)
  await window.setOption('wrap', true)
  await window.setOption('foldenable', false)
  await window.setOption('spell', false)
  await window.setOption('listchars', '')

  await buffer.setLines(text, { start: 0, end: -1, strictIndexing: false })
  await buffer.clearNamespace({ nsId: -1 })
  await buffer.setOption('modified', false)
  await buffer.setOption('modifiable', false)
  // ]);
};
export const createFloatingWindow = async (nvim: Neovim, symbol: protocol.Diagnostic): Promise<Window> => {
  const buffer = (await createBuffer(nvim)) as Buffer;

  const text: string[] = symbol.text.split('\n').map((e: string, idx: number) => {
    if (idx === 0) {
      return leftpad(
        `${symbol.source ? '[' + symbol.source + ']: ' : ''}${e}`,
        1
      );
    }
    return leftpad(e, 1);
  });

  const [width, height] = await popupWindowSize(nvim, text);
  const windowPos = await getWindowPos(nvim, width, height, symbol.start);
  const options: OpenWindowOptions = { ...windowPos, height, width, focusable: false };
  const floatingWindow = (await nvim.openWindow(
    buffer,
    false,
    options
  )) as Window;
  await setBuffer(floatingWindow, buffer, text);
  return floatingWindow;
};
export const createHoverWindow = async (nvim: Neovim, symbol: protocol.QuickInfoResponseBody): Promise<Window> => {

  debugger
  const buffer = (await createBuffer(nvim)) as Buffer;
  console.warn("AM HERE?")
  const text: string[] = processHoverText(symbol);
  const [width, height] = await popupWindowSize(nvim, text);
  const windowPos = await getWindowPos(nvim, width, height, symbol.start);
  const options: OpenWindowOptions = { ...windowPos, height, width, focusable: false };
  const floatingWindow = (await nvim.openWindow(
    buffer,
    false,
    options
  )) as Window;
  await setBuffer(floatingWindow, buffer, text);
  // await nvim.command('noa wincmd p')
  return floatingWindow;
}
