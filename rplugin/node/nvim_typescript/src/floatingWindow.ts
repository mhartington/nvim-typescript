import { Buffer, Neovim, Window } from 'neovim';
import { padString } from './utils';
import { OpenWindowOptions } from 'neovim/lib/api/Neovim';

export let windowRef: Window = null;
const col = async (nvim: Neovim) => await nvim.window.width
const createBuffer = async (nvim: Neovim) => await nvim.createBuffer(false, true);

function processHoverText(symbol: protocol.QuickInfoResponseBody){
  const text = symbol.displayString.split(/\r|\n/g).map(e => padString(e, 1, true));
  let sepLength = text[0].length;
  if (symbol.documentation !== '') {
    const docs = symbol.documentation.split(/\r|\n/g).map(e => padString(e, 1, true));
    let separatorLength = docs.reduce((a, b) => a.length > b.length ? a : b).length;
    if (separatorLength > sepLength) {
      sepLength = separatorLength
    }
    const sep = '-'.repeat(sepLength);
    text.push(sep, ...docs)
  }
  if (symbol.tags && symbol.tags.length > 0) {
    let tags = []

    symbol.tags.forEach(tag => {
      if (tag.name) {
        tags.push(`${padString('@' + tag.name, 1)}`);
      }
      if (tag.text) {
        tags.push(...tag.text.split(/\r|\n/g).filter(Boolean).map(e => padString(e, 1)))
      }
    })

    let separatorLength = tags.reduce((a, b) => a.length > b.length ? a : b).length;
    if (separatorLength > sepLength) {
      sepLength = separatorLength
    }
    const sep = '—'.repeat(sepLength);
    text.push(sep, ...tags)
  }
  return text;
}
const processErrorText = (symbol: protocol.Diagnostic) => {
  return symbol.text.split('\n').map((e: string, idx: number) => {
    if (idx === 0) {
      return padString(
        `${symbol.source ? '[' + symbol.source + ']: ' : ''}${e}`,
        1
      );
    }
    return padString(e, 1);
  });
}
async function popupWindowSize(nvim: Neovim, contents: string[]): Promise<[number, number]> {
  let width = 0;
  let colsize = await col(nvim);
  let max_width = Math.min(colsize, 20)
  let max_height = 20;
  let height = 0;
  for (let line of contents) {
    let lw = line.length;
    if (lw > width) {
      if (lw > max_width) {
        width = max_width;
      }
      width = lw;
    }
    height += 1;
    if (height > max_height) {
      height = max_height;
    }
  }

  return [Math.round(width), Math.round(height)];
};
async function getWindowPos(nvim: Neovim, width: number, height: number, errorStart: protocol.Location): Promise<any> {
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
async function lockBuffer(window: Window, buffer: Buffer) {
  return Promise.all([
    window.setOption('winhl', 'Normal:nvimTypescriptPopupNormal,EndOfBuffer:nvimTypescriptEndOfBuffer'),
    buffer.setOption('filetype', 'markdown'),
    buffer.setOption('buftype', 'nofile'),
    buffer.setOption('bufhidden', 'wipe'),
    window.setOption('wrap', true),
    window.setOption('foldenable', false),
    window.setOption('spell', false),
    window.setOption('listchars', ''),
    buffer.clearNamespace({ nsId: -1 }),
    buffer.setOption('modified', false),
    buffer.setOption('modifiable', false),
  ]);
};
async function unlockBuffer(buffer: Buffer) {
  return Promise.all([
    buffer.setOption('modifiable', true),
  ]);
};
export async function createFloatingWindow(nvim: Neovim, symbol: any, type: "Error" | "Type"): Promise<Window> {
  const buffer = (await createBuffer(nvim)) as Buffer;
  let text: string[];
  if (type === "Error") {
    text = processErrorText(symbol);
  }
  if (type === "Type") {
    text = processHoverText(symbol);
  }
  const [width, height] = await popupWindowSize(nvim, text);
  const windowPos = await getWindowPos(nvim, width, height, symbol.start);
  const options: OpenWindowOptions = { ...windowPos, height, width, focusable: true, style: 'minimal'};
  await buffer.setLines(text, { start: 0, end: -1, strictIndexing: false })
  const floatingWindow = (await nvim.openWindow(
    buffer,
    false,
    options
  )) as Window;
  await lockBuffer(floatingWindow, buffer);
  windowRef = floatingWindow;
  return

};
export function unsetWindow(){
  windowRef = null;
}
export async function updateFloatingWindow(nvim: Neovim, window: Window, symbol: any, type: "Error" | "Type"): Promise<Window> {
  const refText = await windowRef.buffer.lines
  let text: string[];
  if (type === 'Error') {
    text = processErrorText(symbol);
  } else {
    text = processHoverText(symbol);
  }
  let sep = '-'.repeat(Math.max(text.reduce((a, b) => a.length > b.length ? a : b).length, refText.reduce((a, b) => a.length > b.length ? a : b).length))

  if (checkArrays(refText, text)) {
    return window
  }
  let newText: string[];
  if (type === 'Error') {
    newText = [...refText, sep, ...text];
  } else {
    newText = [...text, sep, ...refText];
  }
  const [width, height] = await popupWindowSize(nvim, newText);
  console.warn(width, height)
  await unlockBuffer(await window.buffer)
  await window.buffer.replace(newText, 0)
  await nvim.windowConfig(window, { width, height });
  await lockBuffer(window, await window.buffer);
  return window
}
function checkArrays(arrA: string[], arrB: string[]) { return arrB.map(entry => arrA.includes(entry))[0] };
