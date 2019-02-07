import { Neovim, Buffer } from 'neovim';
import { FileCodeEdits, CodeAction } from 'typescript/lib/protocol';

const leadingNewLineRexeg = /^\n/;
const leadingAndTrailingNewLineRegex = /^\n|\n$/;

export async function promptForSelection(
  options: CodeAction[],
  nvim: Neovim
): Promise<any> {
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

export async function applyCodeFixes(fixes: FileCodeEdits[], nvim: Neovim) {
  // nvim.outWrite(`${JSON.stringify(fixes)} \n`);
  for (let fix of fixes) {
    // applyTextEdits(fix.fileName, fix.textChanges, nvim);
    for (let textChange of fix.textChanges.sort(compare)) {

      // SAME LINE EDIT
      if (textChange.start.line === textChange.end.line) {
        // inserting new text or modifying a line
        let newText = textChange.newText.replace(leadingAndTrailingNewLineRegex, '');

        // MAKE EDIT AT THE START OF THE LINE
        if (textChange.start.offset === 1) {
          console.warn('OFFSET 1');

          let tsVersion = await nvim.call('TSGetVersion');
          if (tsVersion.major < 3) {
            newText = newText.replace(/(\.\.\/)*node_modules\//, '');
          }

          const textToArray = newText.split('\n');
          await nvim.buffer.insert(textToArray, textChange.start.line - 1);
        } 

        // EDIT HAS NEWLINE
        else if (textChange.newText.match(leadingNewLineRexeg)) {
          console.warn("EDIT HAS NEWLINE")
          let textArray = textChange.newText.split('\n').filter(e => e !== "");
          nvim.outWrite(`${JSON.stringify(textArray)} \n`)
          await nvim.buffer.insert(textArray, textChange.start.line);
        }
        // EDIT IS SOMEWHERE IN A LINE
         else {
          console.warn("EDIT IS IN THE MIDDLE")

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

          const addingTrailingComma = textChange.newText.match(/^,$/) ? true : false;
          const lineAlreadyHasTrailingComma = startLine[0].match(/^.*,\s*$/)
          ? true
          : false;

          
          let preSpan = startLine[0].substring(0, textChange.start.offset - 1);
          let postSpan = endLine[0].substring(textChange.end.offset - 1);
          let repList = `${preSpan}${textChange.newText}${postSpan}`.split('\n');

          let count = textChange.start.line;

          repList.forEach(async line => {
            if (count <= textChange.end.line) {

              if (addingTrailingComma && lineAlreadyHasTrailingComma) {
                console.warn("LINE HAS A COMMA")                
                return
              }
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
      // DIFFERENT LINE EDIT
      else {
        // Code fix spans multiple lines
        // Chances are this is removing text.
        // Need to confirm though

        console.log('NOT THE SAME LINE');
        const text = textChange.newText.split('\n');
        nvim.outWrite(`${JSON.stringify(text)} \n`);
        await nvim.buffer.remove(
          textChange.start.line - 1,
          textChange.end.line - 1,
          true
        );
        await nvim.buffer.insert(text, textChange.start.line - 1);
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
      } 
      else if (addingNewLine) {
        console.warn('adding new line');
        await nvim.buffer.insert(newText, changeLine + 1);
      } 
      
      else {
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

function compare(text1: protocol.CodeEdit, text2: protocol.CodeEdit) {
  console.warn(
    `\nONE: ${JSON.stringify(text1)} \nTWO: ${JSON.stringify(text2)}`
  );

  console.warn(`\nFIRST BLOCK: ${text1.start.line !== text2.start.line}`);
  if (text1.start.line !== text2.start.line) {
    console.warn(text2.start.line - text1.start.line);
    return text2.start.line - text1.start.line;
  }
  console.warn(`\nSECOND BLOCK: ${text1.start.offset !== text2.start.offset}`);

  if (text1.start.offset !== text2.start.offset) {
    console.warn(text2.start.offset - text1.start.offset);
    return text2.start.offset - text1.start.offset;
  } 
    return !isInsert(text1) ? -1 : isInsert(text2) ? 0 : 1;
  
}

const isInsert = (range: protocol.CodeEdit) =>
  range.start.line === range.end.line &&
  range.start.offset === range.end.offset;
