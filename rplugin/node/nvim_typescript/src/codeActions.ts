import { Neovim, Buffer } from 'neovim';
import { FileCodeEdits, CodeAction, CodeEdit } from 'typescript/lib/protocol';

const leadingNewLineRexeg = /^\n/;
const leadingAndTrailingNewLineRegex = /^\n|\n$/;

export async function promptForSelection(
  options: CodeAction[],
  nvim: Neovim
): Promise<any> {
  // await nvim.outWrite(`${JSON.stringify(options)} \n`);
  const changeDescriptions = options.map(change => change.description);
  const candidates = changeDescriptions.map(
    (change, idx) => `\n[${idx}]: ${change}`
  );
  return new Promise(async (res, rej) => {
    const input = await nvim.call(
      'input',
      `nvim-ts: Please Select from the following options: \n${candidates} \nplease choose one: `
    );
    if (!input) return rej('Nothing selected');
    if (parseInt(input) > options.length - 1) return rej('Not a valid options');
    return res(options[parseInt(input)].changes);
  });
}

export async function applyCodeFixes(
  fixes: ReadonlyArray<FileCodeEdits>,
  nvim: Neovim
) {
  const cursorPos = await nvim.window.cursor;
  for (let fix of fixes) {
    let commands = [];
    for (let textChange of fix.textChanges.reverse()) {
      // SAME LINE EDIT
      // inserting new text or modifying a line
      if (textChange.start.line === textChange.end.line) {
        // MAKE EDIT AT THE START OF THE LINE
        if (
          textChange.start.offset === 1 &&
          textChange.start.offset === textChange.end.offset
        ) {
          commands.concat(sameLineInsertEdit(textChange, nvim));
        }
        // EDIT HAS NEWLINE
        else if (textChange.newText.match(leadingNewLineRexeg)) {
          commands.concat(sameLineNewLinesEdit(textChange, nvim));
        }
        // EDIT IS SOMEWHERE IN A LINE
        else {
          let startLine = await nvim.buffer.getLines({
            start: textChange.start.line - 1,
            end: textChange.start.line,
            strictIndexing: true
          });
          let endLine = await nvim.buffer.getLines({
            start: textChange.end.line - 1,
            end: textChange.end.line,
            strictIndexing: true
          });

          const addingTrailingComma = textChange.newText.match(/^,$/)
            ? true
            : false;
          const lineAlreadyHasTrailingComma = startLine[0].match(/^.*,\s*$/)
            ? true
            : false;

          let preSpan = startLine[0].substring(0, textChange.start.offset - 1);
          let postSpan = endLine[0].substring(textChange.end.offset - 1);
          let repList = `${preSpan}${textChange.newText}${postSpan}`.split(
            '\n'
          );

          let count = textChange.start.line;

          repList.forEach(async line => {
            if (count <= textChange.end.line) {
              if (addingTrailingComma && lineAlreadyHasTrailingComma) {
                console.warn('LINE HAS A COMMA');
                return;
              }
              commands.push(
                nvim.buffer.setLines(line, {
                  start: count - 1,
                  end: count,
                  strictIndexing: true
                })
              );
            } else {
              commands.push(nvim.buffer.insert(line, count));
            }
            count += 1;
          });
        }
      }
      // DIFFERENT LINE EDIT
      else {
        commands.concat(spanLineEdit(textChange, nvim));
      }
    }
    await nvim.callAtomic(commands);
    nvim.window.cursor = cursorPos;
  }
}

const compare = (text1: protocol.CodeEdit, text2: protocol.CodeEdit) => {
  if (text1.start.line !== text2.start.line) {
    return text2.start.line - text1.start.line;
  }

  if (text1.start.offset !== text2.start.offset) {
    return text2.start.offset - text1.start.offset;
  }
  return !isInsert(text1) ? -1 : isInsert(text2) ? 0 : 1;
};

const isInsert = (range: protocol.CodeEdit) => {
  return (
    range.start.line === range.end.line &&
    range.start.offset === range.end.offset
  );
};

const sameLineInsertEdit = async (fix: CodeEdit, nvim: Neovim) => {
  let newText = fix.newText.replace(leadingAndTrailingNewLineRegex, '');
  let tsVersion = await nvim.call('TSGetVersion');
  if (tsVersion.major < 3) {
    newText = newText.replace(/(\.\.\/)*node_modules\//, '');
  }
  const textToArray = newText.split('\n');

  return [nvim.buffer.insert(textToArray, fix.start.line - 1)];
};
const sameLineNewLinesEdit = (fix: CodeEdit, nvim: Neovim) => {
  let textArray = fix.newText.split('\n').filter(e => e !== '');

  return [nvim.buffer.insert(textArray, fix.start.line)];
};

const spanLineEdit = (fix: CodeEdit, nvim: Neovim): Array<any> => {
  // Code fix spans multiple lines
  // Chances are this is removing text.
  // Need to confirm though
  const commands = [];
  console.log('NOT THE SAME LINE');
  const text = fix.newText.split('\n').filter(e => e.trim() != '');
  commands.push(nvim.buffer.remove(fix.start.line - 1, fix.end.line - 1, true));
  if (text) commands.push(nvim.buffer.insert(text, fix.start.line - 1));
  return commands;
};
