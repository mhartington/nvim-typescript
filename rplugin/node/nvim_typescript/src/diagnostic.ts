import { Neovim } from 'neovim';
import protocol, { Diagnostic } from 'typescript/lib/protocol';
import { createLocList, guid } from './utils';
let signStore: Diagnostic[] = [];

export async function defineSigns(nvim: Neovim, defaults) {
  for (let sign of defaults) {
    await nvim.command(
      `sign define TS${sign.name} text=${sign.signText} texthl=${
        sign.signTexthl
      }`
    );
  }
}
export async function placeSigns(
  nvim: Neovim,
  signs: protocol.Diagnostic[],
  file: string
) {
  await unsetSigns(nvim, file);
  await clearHighlight(nvim);
  const locList = []
  await Promise.all(
    signs.map(async (sign, idx) => {
      sign['id'] = guid();
      await nvim.command(
        `sign place ${sign['id']} line=${
          sign.start.line
        }, name=TSerror file=${file}`
      );
      //list: Array<{ filename: string; lnum: number; col: number; text: string }>,
      locList.push({ filename: file, lnum: sign.start.line, col: sign.start.offset, text: sign.text})
      signStore.push(sign);
      await highlightLine(nvim);
    })
  );
    await createLocList(nvim, locList, 'Errors', false)
}

export async function clearSigns(
  nvim: Neovim, file: string
) {
  await clearHighlight(nvim);
  await unsetSigns(nvim, file);
  await nvim.call('setloclist', [0, [], 'r']);
}

async function unsetSigns(nvim: Neovim, file: string) {
  return await Promise.all(
    signStore.map(async sign => {
      await nvim.command(`sign unplace ${sign['id']} file=${file}`);
      signStore = signStore.filter(e => e['id'] !== sign['id']);
    })
  );
}

export function getSign(
  nvim: Neovim,
  line: number,
  offset: number
): Diagnostic {
  for (let i = 0; i < signStore.length; i++) {
    if (
      signStore[i].start.line === line &&
      signStore[i].start.offset <= offset &&
      signStore[i].end.offset > offset
    ) {
      return signStore[i];
    }
  }
}
async function clearHighlight(nvim: Neovim) {
  await nvim.buffer.clearHighlight({
    lineStart: 1,
    lineEnd: -1
  });
}
async function highlightLine(nvim: Neovim) {
  for (let sign of signStore) {
    await nvim.buffer.addHighlight({
      srcId: sign['id'],
      hlGroup: 'NeomakeError',
      line: sign.start.line - 1,
      colStart: sign.start.offset - 1,
      colEnd: sign.end.offset - 1
    });
  }
}
