import { Neovim } from 'neovim';
import { FileCodeEdits, CodeAction, CodeEdit } from 'typescript/lib/protocol';
import { leftpad } from './utils';

const leadingNewLineRexeg = /^\n/;
const leadingAndTrailingNewLineRegex = /^\n|\n$/;

export async function promptForSelection(options: CodeAction[], nvim: Neovim): Promise<any> {
  const changeDescriptions = options.map(change => change.description);
  const candidates = changeDescriptions.map((change, idx) => `${idx + 1}: ${change}`);
  return new Promise(async (res, rej) => {
    const input = await nvim.call('inputlist', [['nvim-ts: Please Select from the following options:',  ...candidates]]);
    if (!input) return rej('Nothing selected');
    if (parseInt(input) > options.length) return rej('Not a valid options');
    return res(options[parseInt(input)-1].changes);
  });
}
export async function applyCodeFixes(fixes: ReadonlyArray<FileCodeEdits>, nvim: Neovim) {
  const cursorPos = await nvim.window.cursor;
  let commands = [];
  for (let fix of fixes) {
    for (let textChange of fix.textChanges.reverse()) {

      // SAME LINE EDIT
      // inserting new text or modifying a line
      if (textChange.start.line === textChange.end.line) {
        // MAKE EDIT AT THE START OF THE LINE
        if (textChange.start.offset === 1 && textChange.start.offset === textChange.end.offset) {
          commands.concat(await sameLineInsertEdit(textChange, nvim));
        }
        // EDIT HAS NEWLINE
        else if (textChange.newText.match(leadingNewLineRexeg)) {
          commands.concat(await sameLineNewLinesEdit(textChange, nvim));
        }
        // EDIT IS SOMEWHERE IN A LINE
        else {
          commands.concat(await midLineEdit(nvim, textChange))
        }
      }
      // DIFFERENT LINE EDIT
      else {
        commands.concat(await spanLineEdit(textChange, nvim));
      }
    }
  }
  await nvim.callAtomic(commands).catch(err => console.warn("err", err));
  nvim.window.cursor = cursorPos;

}
async function sameLineInsertEdit(fix: CodeEdit, nvim: Neovim) {
  let newText = fix.newText.replace(leadingAndTrailingNewLineRegex, '');
  const buffer = await nvim.buffer;

  let tsVersion = await nvim.call('TSGetVersion');
  if (tsVersion.major < 3) {
    newText = newText.replace(/(\.\.\/)*node_modules\//, '');
  }
  const textToArray = newText.split('\n');

  return await buffer.insert(textToArray, fix.start.line - 1);
};
async function sameLineNewLinesEdit(fix: CodeEdit, nvim: Neovim) {
  const buffer = await nvim.buffer;
  const textArray = fix.newText.split('\n').filter(e => e !== '');
  return await buffer.insert(textArray, fix.start.line);
};
async function spanLineEdit(fix: CodeEdit, nvim: Neovim): Promise<Array<any>> {
  // Code fix spans multiple lines
  // Chances are this is removing text.
  // Need to confirm though
  const commands: any[] = [];
  const buffer = await nvim.buffer;

  if (!fix.newText) {
    // No New text, we're removing something prob
    commands.push(await buffer.remove(fix.start.line - 1, fix.end.line - 1, true));
  }
  else {
    // There is new text, let's just call set lines
    const text = fix.newText.split('\n').filter(e => e.trim() != '');
    if (fix.start.offset > 0) {
      text[0] = leftpad(text[0], fix.start.offset - 1);
    }
    commands.push(await buffer.setLines(text, { start: fix.start.line - 1, end: fix.end.line, strictIndexing: true }));
  }

  return commands;
};
async function midLineEdit(nvim: Neovim, textChange: CodeEdit) {
  let commands = [];
  const startLine = await nvim.buffer.getLines({ start: textChange.start.line - 1, end: textChange.start.line, strictIndexing: true });
  const endLine = await nvim.buffer.getLines({ start: textChange.end.line - 1, end: textChange.end.line, strictIndexing: true });
  const addingTrailingComma = textChange.newText.match(/^,$/) ? true : false;
  const lineAlreadyHasTrailingComma = startLine[0].match(/^.*,\s*$/) ? true : false;
  const preSpan = startLine[0].substring(0, textChange.start.offset - 1);
  const postSpan = endLine[0].substring(textChange.end.offset - 1);
  const repList = `${preSpan}${textChange.newText}${postSpan}`.split('\n');
  let count = textChange.start.line;

  repList.forEach(async (line) => {
    if (count <= textChange.end.line) {
      if (addingTrailingComma && lineAlreadyHasTrailingComma) {
        console.warn('LINE HAS A COMMA');
        return;
      }
      commands.push(nvim.buffer.setLines(line, { start: count - 1, end: count, strictIndexing: true }));
    }
    else {
      commands.push(nvim.buffer.insert(line, count));
    }
    count += 1;
  });
  return commands;
}

