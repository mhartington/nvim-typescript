import { Neovim } from 'neovim';
import { Diagnostic } from 'typescript/lib/protocol';
import { createLocList } from './utils';

interface SignStoreSign extends Diagnostic {
  id: number;
}
const name = 'TSDiagnostics';
export class DiagnosticProvider {
  public signStore: Array<{ file: string; signs: Array<SignStoreSign> }> = [];
  public nvim: Neovim;
  public signID = 1;
  private diagnosticSigns = [];
  private namespaceId: number;
  async defineSigns(defaults: any) {
    this.diagnosticSigns = defaults;
    return Promise.all(
      defaults.map(async (sign: any) => {
        let name = Object.keys(sign)[0];
        let data = sign[name];
        // await this.nvim.command(`sign define ${name} text=${data.signText} texthl=${data.signTexthl}`)
        await this.nvim.call('sign_define', [ name, { text: data.signText, texthl: data.signTexthl } ]);
      })
    );
  }
  async createNamespace() {
    this.namespaceId = await this.nvim.createNamespace(name)
  }
  async placeSigns(incomingSigns: Diagnostic[], file: string) {
    const locList = [];

    // Clear current sings for now.
    // debugger
    // console.warn('CALLING CLEAR SIGNS')
    await this.clearSigns(file);

    // Get the current file
    let current = this.signStore.find(entry => entry.file === file);
    // If it doesn't exist, make new entry
    if (!current) this.signStore.push({ file, signs: [] });
    // Search again
    current = this.signStore.find(entry => entry.file === file);
    // Normalize sings
    let normSigns = this.normalizeSigns(incomingSigns);
    current.signs = JSON.parse(JSON.stringify(normSigns));

    // Set buffer var for airline
    await this.nvim.buffer.setVar('nvim_typescript_diagnostic_info', current.signs);

    // console.warn("NOW SETTING SIGN")
    await Promise.all(
      current.signs.map(async sign => {
        await this.nvim.call('sign_place', [sign.id, name, `TS${sign.category}`, current.file, { lnum: sign.start.line, priority: 90 }]);
        // await this.nvim.command(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
        locList.push({ filename: current.file, lnum: sign.start.line, col: sign.start.offset, text: sign.text, code: sign.code, type: sign.category[0].toUpperCase() });
      })
    )

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
      await this.clearHighlight(),
      await this.unsetSigns(file)
    ]);
  }
  async unsetSigns(file: string) {
    const currentEntry = this.signStore.find(entry => entry.file === file);

    if (currentEntry && currentEntry.signs.length > 0) {
      await Promise.all(
        currentEntry.signs
        .map(async (sign) => await this.nvim.call('sign_unplace', [name, { id: sign.id, buffer: currentEntry.file }]))
        // .map(async (sign) => await this.nvim.command(`sign unplace ${sign.id} file=${currentEntry.file}`))
        .filter(() => false)
      )

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
  async clearHighlight() {
    await this.nvim.buffer.clearNamespace({
      nsId: this.namespaceId,
      lineEnd: -1,
      lineStart: 0,
    })
  }
  async highlightLine(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    if (current) {
      await Promise.all([
        current.signs.map(async sign => {
          let hlGroup = this.getSignHighlight(sign);
          await this.nvim.buffer.addHighlight({
            srcId: this.namespaceId,
            hlGroup,
            line: sign.start.line - 1,
            colStart: sign.start.offset - 1,
            colEnd: sign.end.offset - 1
          });

        })

      ])
    }
  }
  getSignHighlight(sign: SignStoreSign) {
    for (let entry of this.diagnosticSigns) {
      let name = Object.keys(entry)[0];
      let data = entry[name];
      if (name === `TS${sign.category}`) {
        return data.texthl;
      }
    }
  }
}
export const DiagnosticHost = new DiagnosticProvider();
