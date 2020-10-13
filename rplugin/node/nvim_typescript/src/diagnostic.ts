import { Neovim } from 'neovim';
import { Diagnostic } from 'typescript/lib/protocol';
import { createLocList, getBufferFromFile } from './utils';

interface SignStoreSign extends Diagnostic {
  id: number;
}
const name = 'TSDiagnostics';
class DiagnosticProvider {
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
        await this.nvim.call('sign_define', [name, { text: data.signText, texthl: data.signTexthl }]);
      })
    );
  }
  async createNamespace() {
    this.namespaceId = await this.nvim.createNamespace(name)
  }
  async placeSigns(incomingSigns: Diagnostic[], file: string) {
    const locList = [];

    // Get the current file
    if (!this.signStore.find(entry => entry.file === file)) {
      this.signStore.push({ file, signs: [] })
    }
    const current = this.signStore.find(entry => entry.file === file);

    // Clear current sings for now.
    await this.clearSigns(current);

    // Normalize signs
    const normSigns = this.normalizeSigns(incomingSigns);
    current.signs = [];
    current.signs = normSigns;
    // console.warn(JSON.stringify(current.signs))
    // Set buffer var for airline
    await this.nvim.buffer.setVar('nvim_typescript_diagnostic_info', current.signs);
    // console.warn("NOW SETTING SIGN")
    await Promise.all(
      current.signs.map(async sign => {
        await this.nvim.call('sign_place', [sign.id, name, `TS${sign.category}`, current.file, { lnum: sign.start.line, priority: 90 }]);
        locList.push({ filename: current.file, lnum: sign.start.line, col: sign.start.offset, text: sign.text, code: sign.code, type: sign.category[0].toUpperCase() });
      })
    )

    await this.highlightLine(current);
    createLocList(this.nvim, locList, 'Errors', false);
  }
  normalizeSigns(signs: Diagnostic[]) {
    return signs.map(sign => ({ ...sign, id: this.signID++ }));
  }
  async clearSigns(current: { file: string, signs: SignStoreSign[] }) {
    if (current.signs.length > 0) {
      await this.clearHighlight();
      await this.nvim.call('sign_unplace', [name, { buffer: current.file }])
    }
  }
  async clearHighlight() {
    const buffer = await this.nvim.buffer;
    buffer.clearNamespace({
      nsId: this.namespaceId,
      lineStart: 0,
      lineEnd: -1,
    })
  }
  getSign(file: string, line: number, offset: number): SignStoreSign {
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
  async highlightLine(current: { file: string, signs: SignStoreSign[] }) {
    const buffer = await getBufferFromFile(this.nvim, current.file);
    await Promise.all([
      current.signs.map(async sign => {
        let hlGroup = this.getSignHighlight(sign);
        await buffer.addHighlight({
          srcId: this.namespaceId,
          hlGroup,
          line: sign.start.line - 1,
          colStart: sign.start.offset - 1,
          colEnd: sign.end.offset - 1
        });
      })
    ])
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
  async clearAllHighlights(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    // console.log(current)
    await this.clearHighlight();
  }
}
export const DiagnosticHost = new DiagnosticProvider();
