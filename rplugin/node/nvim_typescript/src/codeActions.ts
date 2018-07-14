import { Neovim, Buffer } from 'neovim';
import { FileCodeEdits, CodeAction } from 'typescript/lib/protocol';

const leadingNewLineRexeg = /^\n/;
const leadingAndTrailingNewLineRegex = /^\n|\n$/;

export async function promptForSelection(options: CodeAction[], nvim: Neovim): Promise<any> {
  const changeDescriptions = options.map(change => change.description);
  const canidates = changeDescriptions.map(
    (change, idx) => `\n[${idx}]: ${change}`
  );
  return new Promise(async (res, rej) => {
    const input = await nvim.call(
      'input',
      `nvim-ts: Please Select from the following options: \n${canidates} \nplease choose one: `
    );
    if (!input) return rej('Nothing selected');
    if (parseInt(input) > options.length - 1) return rej('Not a valid options');
    return res(options[parseInt(input)].changes);
  });
}

export async function applyCodeFixes(fixes: FileCodeEdits[], nvim: Neovim) {
  for (let fix of fixes) {
    for (let textChange of fix.textChanges) {
      if (textChange.start.line === textChange.end.line) {
        // inserting new text or modifying a line
        const newText = textChange.newText.replace(leadingAndTrailingNewLineRegex,'');
        if (textChange.start.offset === 1) {
          console.warn('OFFSET 1');
          console.warn(newText, textChange.start.line - 1);
          await nvim.buffer.insert(newText, textChange.start.line - 1);
        }
        else if (textChange.newText.match(leadingNewLineRexeg)) {
          console.warn('ADDING NEW LINE');
          await nvim.buffer.insert(textChange.newText, textChange.start.line);
        }
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

          let preSpan = startLine[0].substring(0, textChange.start.offset - 1);
          let postSpan = endLine[0].substring(textChange.end.offset - 1);
          let repList = `${preSpan}${textChange.newText}${postSpan}`.split(
            '\n'
          );
          let count = textChange.start.line;
          repList.forEach(async line => {
            if (count <= textChange.end.line) {
              await nvim.buffer.setLines(line, {
                start: count - 1,
                end: count,
                strictIndexing: true
              });
            } else {
              await nvim.buffer.insert(line, count);
            }
            count += 1;
          });
        }
      }
      else {
        // Code fix spans multiple lines
        // Chances are this is removing text.
        // Need to confirm though
        console.log('NOT THE SAME LINE');
        await nvim.buffer.remove(textChange.start.line - 1, textChange.end.line -1, true);
      }
    }
  }
}

export async function applyImports(fixes: FileCodeEdits[], nvim: Neovim) {
  for (let fix of fixes) {
    for (let change of fix.textChanges) {
      const changeLine = change.start.line - 1;
      const changeOffset = change.start.offset;
      const addingNewLine = change.newText.match(leadingNewLineRexeg)
        ? true
        : false;
      const newText = change.newText.replace(
        leadingAndTrailingNewLineRegex,
        ''
      );

      if (changeOffset === 1) {
        console.warn('changOffset === 1');
        console.warn(newText, changeLine);
        await nvim.buffer.insert(newText, changeLine);
      } else if (addingNewLine) {
        console.warn('adding new line');
        await nvim.buffer.insert(newText, changeLine + 1);
      } else {
        const addingTrailingComma = newText.match(/^,$/) ? true : false;
        const linesToChange = await nvim.buffer.getLines({
          start: changeLine,
          end: changeLine + 1,
          strictIndexing: true
        });
        const lineAlreadyHasTrailingComma = linesToChange[0].match(/^.*,\s*$/)
          ? true
          : false;

        if (addingTrailingComma && lineAlreadyHasTrailingComma) {
          console.log('nothing to see folks');
        } else {
          console.log('no trailing comma, and line has no trailing comma');
          await nvim.buffer.setLines(
            `${linesToChange[0].substring(
              changeOffset - 1,
              0
            )}${newText}${linesToChange[0].substring(changeOffset - 1)} `,
            { start: changeLine, end: changeLine + 1, strictIndexing: true }
          );
        }
      }
    }
  }
}
