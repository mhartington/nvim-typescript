import { Neovim } from 'neovim';
import { Diagnostic } from 'typescript/lib/protocol';
import { createLocList, guid } from './utils';
let signStore: Array<{ file: string; signs: any[] }> = [];

export async function defineSigns(nvim: Neovim, defaults) {
  for (let sign of defaults) {
    await nvim.command(
      `sign define ${sign.name} text=${sign.signText} texthl=${sign.signTexthl}`
    );
  }
}

export async function placeSigns(
  nvim: Neovim,
  incomingSigns: Diagnostic[],
  file: string
) {
  await unsetSigns(nvim, file);
  await clearHighlight(nvim);

  const locList = [];
  const formattedSigns = normalizeSigns(incomingSigns);

  let current = signStore.find(entry => entry.file === file);
  if (!current) {
    signStore.push({ file, signs: [] });
  }

  current = signStore.find(entry => entry.file === file);
  current.signs = formattedSigns;

  await Promise.all(
    current.signs.map(async (sign, idx) => {
      await nvim.command(
        `sign place ${sign.id} line=${sign.start.line}, name=TS${
          sign.category
        } file=${current.file}`
      );
      //list: Array<{ filename: string; lnum: number; col: number; text: string }>,
      locList.push({
        filename: current.file,
        lnum: sign.start.line,
        col: sign.start.offset,
        text: sign.text
      });
    })
  );
  await highlightLine(nvim, file);
  await createLocList(nvim, locList, 'Errors', false);
}

function normalizeSigns(signs: Diagnostic[]) {
  return signs.map(sign => {
    return { ...sign, id: guid() };
  });
}

export async function clearSigns(nvim: Neovim, file: string) {
  await clearHighlight(nvim);
  await unsetSigns(nvim, file);
  await nvim.call('setloclist', [0, [], 'r']);
}

async function unsetSigns(nvim: Neovim, file: string) {
  const current = signStore.find(entry => entry.file === file);
  if (current) {
    return await Promise.all(
      current.signs.map(async (sign, idx) => {
        await nvim.command(`sign unplace ${sign.id} file=${current.file}`);
        signStore = signStore.map(entry => {
          if (entry === current) entry.signs = [];
          return entry;
        });
      })
    );
  }
}

export function getSign(
  nvim: Neovim,
  file: string,
  line: number,
  offset: number
): Diagnostic {
  const current = signStore.find(entry => entry.file === file);
  if (current) {
    let signs = current.signs;
    for (let i = 0; i < signs.length; i++) {
      if (
        signs[i].start.line === line &&
        signs[i].start.offset <= offset &&
        signs[i].end.offset > offset
      ) {
        return signs[i];
      }
    }
  }
}

async function clearHighlight(nvim: Neovim) {
  await nvim.buffer.clearHighlight({
    lineStart: 1,
    lineEnd: -1
  });
}
async function highlightLine(nvim: Neovim, file: string) {
  const current = signStore.find(entry => entry.file === file);
  if (current) {
    for (let sign of current.signs) {
      await nvim.buffer.addHighlight({
        srcId: sign['id'],
        hlGroup: 'NeomakeError',
        line: sign.start.line - 1,
        colStart: sign.start.offset - 1,
        colEnd: sign.end.offset - 1
      });
    }
  }
}
