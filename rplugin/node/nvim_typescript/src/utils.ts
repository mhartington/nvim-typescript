import protocol from 'typescript/lib/protocol';

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

export async function getCurrentImports(client: any, inspectedFile: string) {
  return new Promise(async (resolve, reject) => {
    const documentSymbols = await client.getDocumentSymbols({
      file: inspectedFile
    });
    if (documentSymbols.childItems) {
      return resolve(
        documentSymbols.childItems
          .filter(item => item.kind === 'alias')
          .map(item => item.text)
      );
    } else {
      return reject();
    }
  });
}

export async function getImportCandidates(
  client: any,
  currentFile: string,
  cursorPosition: { line: number; col: number }
): Promise<protocol.CodeFixResponse['body']> {
  const cannotFindNameError = 2304;
  const args = {
    file: currentFile,
    startLine: cursorPosition.line,
    endLine: cursorPosition.line,
    startOffset: cursorPosition.col,
    endOffset: cursorPosition.col,
    errorCodes: [cannotFindNameError]
  };
  return await client.getCodeFixesAtCursor(args);
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
  entry: protocol.CompletionEntryDetails
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
  // let documentation = menuText;
  let kind = await getKind(nvim, entry.kind);
  return {
    word: entry.name,
    kind: kind,
    menu: menuText
  };
}

export function getLocale(procEnv) {
  const lang =
    procEnv.LC_ALL || procEnv.LC_MESSAGES || procEnv.LANG || procEnv.LANGUAGE;
  return lang && lang.replace(/[.:].*/, '').replace(/[_:].*/, '');
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
