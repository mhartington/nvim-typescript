import protocol from 'typescript/lib/protocol';
import { Neovim } from 'neovim';
import { Client } from './client';
export function trim(s: string) {
  return (s || '').replace(/^\s+|\s+$/g, '');
}

export function convertToDisplayString(displayParts?: any[]) {
  let ret = '';
  if (!displayParts) return ret;
  for (let dp of displayParts) {
    ret += dp['text'];
  }
  return ret;
}

export function getParams(
  members: Array<{ text: string; documentation: string }>,
  separator: string
) {
  let ret = '';
  members.forEach((member, idx) => {
    if (idx === members.length - 1) {
      ret += member.text;
    } else {
      ret += member.text + separator;
    }
    return ret;
  });
}

export async function getCurrentImports(client: Client, file: string) {
  const documentSymbols = await client.getDocumentSymbols({ file });
  if (documentSymbols.childItems) {
    return Promise.all(
      documentSymbols.childItems
        .filter(item => item.kind === 'alias')
        .map(item => item.text)
    );
  } else {
    return;
  }
}

export async function convertEntry(
  nvim,
  entry: protocol.CompletionEntry
): Promise<any> {
  let kind = await getKind(nvim, entry.kind);
  return {
    word: entry.name,
    kind: kind
  };
}

export async function convertDetailEntry(
  nvim: any,
  entry: protocol.CompletionEntryDetails,
  expandSnippet = false
): Promise<any> {
  let displayParts = entry.displayParts;
  let signature = '';
  for (let p of displayParts) {
    signature += p.text;
  }
  signature = signature.replace(/\s+/gi, ' ');
  let menuText = signature.replace(
    /^(var|let|const|class|\(method\)|\(property\)|enum|namespace|function|import|interface|type)\s+/gi,
    ''
  );
  let formatted = !!(expandSnippet) ? `${entry.name}${getAbbr(entry)}` : entry.name
  // let documentation = menuText;
  // let kind = await getKind(nvim, entry.kind);

  return {
    word: formatted,
    kind: entry.kind,
    abbr: entry.name,
    menu: menuText
  };
}

function getAbbr(entry: protocol.CompletionEntryDetails) {
  let name = entry.name;
  return entry.displayParts
    .filter(e => (e.kind === 'parameterName' ? e : null))
    .map(e => e.text)
    .map((e, idx) => '<`' + (idx) + ':' + e + '`>')
    .join(', ');
}

export async function getKind(nvim: any, kind: string): Promise<any> {
  const icons = await nvim.getVar('nvim_typescript#kind_symbols');
  if (kind in icons) return icons[kind];
  return kind;
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export async function createLocList(
  nvim: Neovim,
  list: Array<{ filename: string; lnum: number; col: number; text: string }>,
  title: string,
  autoOpen = true
) {
  return new Promise(async (resolve, reject) => {
    await nvim.call('setloclist', [0, list, 'r', title]);
    if (autoOpen) {
      await nvim.command('lwindow');
    }
    resolve();
  });
}

export async function createQuickFixList(
  nvim: Neovim,
  list: Array<{
    filename: string;
    lnum: number;
    col: number;
    text: string;
    code?: number;
  }>,
  title: string,
  autoOpen = true
) {
  return new Promise(async (resolve, reject) => {
    await nvim.call('setqflist', [list, 'r', title]);
    if (autoOpen) {
      await nvim.command('copen');
    }
    resolve();
  });
}

export const guid = () => Math.floor((1 + Math.random()) * 0x10000);

export async function printEllipsis(nvim: Neovim, message: string) {
  /**
   * Print as much of msg as possible without triggering "Press Enter"
   * Inspired by neomake, which is in turn inspired by syntastic.
   */
  const columns = (await nvim.getOption('columns')) as number;
  let msg = message.replace('\n', '. ');
  if (msg.length > columns - 15) {
    msg = msg.substring(0, columns - 20) + '...';
  }
  await nvim.outWrite(`nvim-ts: ${msg} \n`);
}
