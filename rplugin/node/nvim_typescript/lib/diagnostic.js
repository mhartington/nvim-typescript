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
let signStore = [];
function defineSigns(nvim, defaults) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let sign of defaults) {
            yield nvim.command(`sign define ${sign.name} text=${sign.signText} texthl=${sign.signTexthl}`);
        }
    });
}
exports.defineSigns = defineSigns;
function placeSigns(nvim, incomingSigns, file) {
    return __awaiter(this, void 0, void 0, function* () {
        yield unsetSigns(nvim, file);
        yield clearHighlight(nvim);
        const locList = [];
        const formattedSigns = normalizeSigns(incomingSigns);
        let current = signStore.find(entry => entry.file === file);
        if (!current) {
            signStore.push({ file, signs: [] });
        }
        current = signStore.find(entry => entry.file === file);
        current.signs = formattedSigns;
        yield Promise.all(current.signs.map((sign, idx) => __awaiter(this, void 0, void 0, function* () {
            yield nvim.command(`sign place ${sign.id} line=${sign.start.line}, name=TS${sign.category} file=${current.file}`);
            //list: Array<{ filename: string; lnum: number; col: number; text: string }>,
            locList.push({
                filename: current.file,
                lnum: sign.start.line,
                col: sign.start.offset,
                text: sign.text
            });
        })));
        yield highlightLine(nvim, file);
        yield utils_1.createLocList(nvim, locList, 'Errors', false);
    });
}
exports.placeSigns = placeSigns;
function normalizeSigns(signs) {
    return signs.map(sign => {
        return Object.assign({}, sign, { id: utils_1.guid() });
    });
}
function clearSigns(nvim, file) {
    return __awaiter(this, void 0, void 0, function* () {
        yield clearHighlight(nvim);
        yield unsetSigns(nvim, file);
        yield nvim.call('setloclist', [0, [], 'r']);
    });
}
exports.clearSigns = clearSigns;
function unsetSigns(nvim, file) {
    return __awaiter(this, void 0, void 0, function* () {
        const current = signStore.find(entry => entry.file === file);
        if (current) {
            return yield Promise.all(current.signs.map((sign, idx) => __awaiter(this, void 0, void 0, function* () {
                yield nvim.command(`sign unplace ${sign.id} file=${current.file}`);
                signStore = signStore.map(entry => {
                    if (entry === current)
                        entry.signs = [];
                    return entry;
                });
            })));
        }
    });
}
function getSign(nvim, file, line, offset) {
    const current = signStore.find(entry => entry.file === file);
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
exports.getSign = getSign;
function clearHighlight(nvim) {
    return __awaiter(this, void 0, void 0, function* () {
        yield nvim.buffer.clearHighlight({
            lineStart: 1,
            lineEnd: -1
        });
    });
}
function highlightLine(nvim, file) {
    return __awaiter(this, void 0, void 0, function* () {
        const current = signStore.find(entry => entry.file === file);
        if (current) {
            for (let sign of current.signs) {
                yield nvim.buffer.addHighlight({
                    srcId: sign['id'],
                    hlGroup: 'NeomakeError',
                    line: sign.start.line - 1,
                    colStart: sign.start.offset - 1,
                    colEnd: sign.end.offset - 1
                });
            }
        }
    });
}
