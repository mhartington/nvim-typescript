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
  nvim: Neovim,
  entry: protocol.CompletionEntry
): Promise<any> {
  let kind = await getKind(nvim, entry.kind);
  return {
    word: entry.name,
    kind: kind
  };
}

export async function convertDetailEntry(
  nvim: Neovim,
  entry: protocol.CompletionEntryDetails,
  expandSnippet = false
): Promise<any> {
  let displayParts = entry.displayParts;
  let signature = '';
  for (let p of displayParts) {
    signature += p.text;
  }
  signature = signature.replace(/\s+/gi, ' ');
  const menu = signature.replace(
    /^(var|let|const|class|\(method\)|\(property\)|enum|namespace|function|import|interface|type)\s+/gi,
    ''
  );
  const word = !!expandSnippet ? `${entry.name}${getAbbr(entry)}` : entry.name;
  const info = entry.documentation.map(d => d.text).join('\n');

  return {
    word: word,
    kind: entry.kind,
    abbr: entry.name,
    menu: menu,
    info: info
  };
}

function getAbbr(entry: protocol.CompletionEntryDetails) {
  return entry.displayParts
    .filter(e => (e.kind === 'parameterName' ? e : null))
    .map(e => e.text)
    .map((e, idx) => '<`' + idx + ':' + e + '`>')
    .join(', ');
}

export async function getKind(nvim: any, kind: string): Promise<any> {
  const icons = await nvim.getVar('nvim_typescript#kind_symbols');
  if (kind in icons) return icons[kind];
  return kind;
}

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, function (txt) {
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

export async function truncateMsg(nvim: Neovim, message: string): Promise<string> {
  /**
   * Print as much of msg as possible without triggering "Press Enter"
   * Inspired by neomake, which is in turn inspired by syntastic.
   */
  const columns = (await nvim.getOption('columns')) as number;
  let msg = message.replace(/(\r\n|\n|\r|\t)/gm, ' ')
  if (msg.length > columns - 9) return msg.substring(0, columns - 11) + '…';
  return msg
}



export async function printHighlight(
  nvim: Neovim,
  message: string | Promise<string>,
  statusHL = 'None',
  messageHL = 'NormalNC'
) {
  const ruler = (await nvim.getOption('ruler')) as boolean;
  const showCmd = (await nvim.getOption('showcmd')) as boolean;
  const msg = (message as string).replace(/\"/g, '\\"');
  await nvim.setOption('ruler', false);
  await nvim.setOption('showcmd', false);
  await nvim.command(
    `redraws! | echohl ${statusHL} | echon "nvim-ts: " | echohl None | echohl ${messageHL} | echon "${msg}" | echohl None `
  );
  await nvim.setOption('ruler', ruler);
  await nvim.setOption('showcmd', showCmd);
}

// reduceByPrefix takes a list of basic complettions and a prefix and eliminates things
// that don't match the prefix
export const reduceByPrefix = (
  prefix: string,
  c: ReadonlyArray<protocol.CompletionEntry>
) => {
  const re = new RegExp(prefix, 'i');
  return c.filter(v => re.test(v.name));
};

// for testing rename results to gurantee the object type
export const isRenameSuccess = (
  obj: protocol.RenameInfoSuccess | protocol.RenameInfoFailure
): obj is protocol.RenameInfoSuccess => obj.canRename;

// trigger char is for complete requests to the TSServer, there are special completions when the
// trigger character is ., ", /, etc..
const chars = ['.', '"', "'", '`', '/', '@', '<'];
export const triggerChar = (
  p: string
): protocol.CompletionsTriggerCharacter | undefined => {
  const char = p[p.length - 1];
  return chars.includes(char)
    ? (char as protocol.CompletionsTriggerCharacter)
    : undefined;
};
