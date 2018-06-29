import { Neovim } from 'neovim';
import { Diagnostic } from 'typescript/lib/protocol';
import { createLocList, guid, createQuickFixList } from './utils';

let signID = 1;

interface SignStoreSign extends Diagnostic {
  id: number;
}

export class DiagnosticProvider {
  public signStore: Array<{ file: string; signs: Array<SignStoreSign> }> = [];
  public nvim: Neovim;
  async defineSigns(defaults) {
    for (let sign of defaults) {
      await this.nvim.command(
        `sign define ${sign.name} text=${sign.signText} texthl=${
          sign.signTexthl
        }`
      );
    }
  }

  async placeSigns(incomingSigns: Diagnostic[], file: string) {
    await this.unsetSigns(file);
    await this.clearHighlight();

    const locList = [];
    const formattedSigns = this.normalizeSigns(incomingSigns);

    let current = this.signStore.find(entry => entry.file === file);
    if (!current) {
      this.signStore.push({ file, signs: [] });
    }

    current = this.signStore.find(entry => entry.file === file);
    current.signs = formattedSigns;

    await Promise.all(
      current.signs.map(async (sign, idx) => {
        await this.nvim.command(
          `sign place ${sign.id} line=${sign.start.line}, name=TS${
            sign.category
          } file=${current.file}`
        );
        locList.push({
          filename: current.file,
          lnum: sign.start.line,
          col: sign.start.offset,
          text: sign.text,
          code: sign.code,
          type: sign.category[0].toUpperCase()
        });
      })
    );
    await this.highlightLine(file);
    await createLocList(this.nvim, locList, 'Errors', false);
  }

  normalizeSigns(signs: Diagnostic[]) {
    signID += 1;
    return signs.map(sign => {
      return { ...sign, id: signID };
    });
  }

  async clearSigns(file: string) {
    await this.clearHighlight();
    await this.unsetSigns(file);
    await this.nvim.call('setqflist', [[]]);
  }

  async unsetSigns(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    if (current) {
      return await Promise.all(
        current.signs.map(async (sign, idx) => {
          await this.nvim.command(
            `sign unplace ${sign.id} file=${current.file}`
          );
          this.signStore = this.signStore.map(entry => {
            if (entry === current) entry.signs = [];
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

  async clearHighlight() {
    await this.nvim.buffer.clearHighlight({
      lineStart: 1,
      lineEnd: -1
    });
  }
  async highlightLine(file: string) {
    const current = this.signStore.find(entry => entry.file === file);
    if (current) {
      for (let sign of current.signs) {
        await this.nvim.buffer.addHighlight({
          srcId: sign['id'],
          hlGroup: 'NeomakeError',
          line: sign.start.line - 1,
          colStart: sign.start.offset - 1,
          colEnd: sign.end.offset - 1
        });
      }
    }
  }
}

export const DiagnosticHost = new DiagnosticProvider();
