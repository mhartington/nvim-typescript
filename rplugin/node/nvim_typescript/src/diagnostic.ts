import { Neovim } from 'neovim';
import { Diagnostic } from 'typescript/lib/protocol';
import { createLocList, createQuickFixList } from './utils';

interface SignStoreSign extends Diagnostic {
  id: number;
}

export class DiagnosticProvider {
  public signStore: Array<{ file: string; signs: Array<SignStoreSign> }> = [];
  public nvim: Neovim;
  public signID = 1;
  private diagnosticSigns = [];
  async defineSigns(defaults) {
    this.diagnosticSigns = defaults;
    for (let sign of defaults) {
      let name = Object.keys(sign)[0];
      let data = sign[name];

      await this.nvim.command(`sign define ${name} text=${data.signText} texthl=${data.signTexthl}`)
    }
  }
  async placeSigns(incomingSigns: Diagnostic[], file: string) {
    const locList = [];
    await this.clearSigns(file)
    let current = this.signStore.find(entry => entry.file === file);

    if (!current) this.signStore.push({ file, signs: [] });
    current = this.signStore.find(entry => entry.file === file);

    current.signs = this.normalizeSigns(incomingSigns);
    current.signs.forEach( async (sign, idx) => {
      console.warn(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
      await this.nvim.command(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
      locList.push({
        filename: current.file,
        lnum: sign.start.line,
        col: sign.start.offset,
        text: sign.text,
        code: sign.code,
        type: sign.category[0].toUpperCase()
      });
    })
    await this.highlightLine(current.file);
    createLocList(this.nvim, locList, 'Errors', false);
  }
  normalizeSigns(signs: Diagnostic[]) {
    return signs.map(sign => {
      return { ...sign, id: this.signID++ };
    });
  }
  async clearSigns(file: string) {
    return Promise.all([
      await this.clearHighlight(file),
      await this.unsetSigns(file)
    ]);
  }
  async unsetSigns(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    if (current && current.signs.length > 0) {
      return Promise.all(

        current.signs.map(async (sign, idx) => {
          console.warn(`sign unplace ${sign.id} file=${current.file}`);

          await this.nvim.command(`sign unplace ${sign.id} file=${current.file}`);

          this.signStore = this.signStore.map(entry => {
            if (entry.file === current.file) {
              entry.signs = []
            };
            return entry;
          });
        })

      );
    }
  }
  getSign(file: string, line: number, offset: number): Diagnostic {
    const current = this.signStore.find(entry => entry.file === file);
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
  async clearHighlight(file: string) {
    await this.nvim.buffer.clearHighlight({
      lineStart: 1,
      lineEnd: -1
    });
  }
  async highlightLine(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    if (current) {
      for (let sign of current.signs) {
        let hlGroup = this.getSignHighlight(sign)
        await this.nvim.buffer.addHighlight({
          srcId: sign.id,
          hlGroup,
          line: sign.start.line - 1,
          colStart: sign.start.offset - 1,
          colEnd: sign.end.offset - 1
        });
      }
    }
  }
  getSignHighlight(sign: SignStoreSign){
    for (let entry of this.diagnosticSigns) {
      let name = Object.keys(entry)[0];
      let data = entry[name];
      if(name === `TS${sign.category}`){
        return data.texthl
      }
    }
  }
}

export const DiagnosticHost = new DiagnosticProvider();
