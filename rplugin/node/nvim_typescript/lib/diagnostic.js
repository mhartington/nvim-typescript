"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class DiagnosticProvider {
    constructor() {
        this.signStore = [];
        this.signID = 1;
        this.diagnosticSigns = [];
    }
    defineSigns(defaults) {
        return __awaiter(this, void 0, void 0, function* () {
            this.diagnosticSigns = defaults;
            for (let sign of defaults) {
                let name = Object.keys(sign)[0];
                let data = sign[name];
                yield this.nvim.command(`sign define ${name} text=${data.signText} texthl=${data.signTexthl}`);
            }
        });
    }
    placeSigns(incomingSigns, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const locList = [];
            yield this.clearSigns(file);
            let current = this.signStore.find(entry => entry.file === file);
            if (!current)
                this.signStore.push({ file, signs: [] });
            current = this.signStore.find(entry => entry.file === file);
            current.signs = this.normalizeSigns(incomingSigns);
            current.signs.forEach((sign, idx) => __awaiter(this, void 0, void 0, function* () {
                console.warn(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
                yield this.nvim.command(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
                locList.push({
                    filename: current.file,
                    lnum: sign.start.line,
                    col: sign.start.offset,
                    text: sign.text,
                    code: sign.code,
                    type: sign.category[0].toUpperCase()
                });
            }));
            yield this.highlightLine(current.file);
            utils_1.createLocList(this.nvim, locList, 'Errors', false);
        });
    }
    normalizeSigns(signs) {
        return signs.map(sign => {
            return Object.assign({}, sign, { id: this.signID++ });
        });
    }
    clearSigns(file) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all([
                yield this.clearHighlight(file),
                yield this.unsetSigns(file)
            ]);
        });
    }
    unsetSigns(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = this.signStore.find(entry => entry.file === file);
            if (current && current.signs.length > 0) {
                return Promise.all(current.signs.map((sign, idx) => __awaiter(this, void 0, void 0, function* () {
                    console.warn(`sign unplace ${sign.id} file=${current.file}`);
                    yield this.nvim.command(`sign unplace ${sign.id} file=${current.file}`);
                    this.signStore = this.signStore.map(entry => {
                        if (entry.file === current.file) {
                            entry.signs = [];
                        }
                        ;
                        return entry;
                    });
                })));
            }
        });
    }
    getSign(file, line, offset) {
        const current = this.signStore.find(entry => entry.file === file);
        if (current) {
            let signs = current.signs;
            for (let i = 0; i < signs.length; i++) {
                if (signs[i].start.line === line &&
                    signs[i].start.offset <= offset &&
                    signs[i].end.offset > offset) {
                    return signs[i];
                }
            }
        }
    }
    clearHighlight(file) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.nvim.buffer.clearHighlight({
                lineStart: 1,
                lineEnd: -1
            });
        });
    }
    highlightLine(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = this.signStore.find(entry => entry.file === file);
            if (current) {
                for (let sign of current.signs) {
                    let hlGroup = this.getSignHighlight(sign);
                    yield this.nvim.buffer.addHighlight({
                        srcId: sign.id,
                        hlGroup,
                        line: sign.start.line - 1,
                        colStart: sign.start.offset - 1,
                        colEnd: sign.end.offset - 1
                    });
                }
            }
        });
    }
    getSignHighlight(sign) {
        for (let entry of this.diagnosticSigns) {
            let name = Object.keys(entry)[0];
            let data = entry[name];
            if (name === `TS${sign.category}`) {
                return data.texthl;
            }
        }
    }
}
exports.DiagnosticProvider = DiagnosticProvider;
exports.DiagnosticHost = new DiagnosticProvider();
