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
            yield nvim.command(`sign define TS${sign.name} text=${sign.signText} texthl=${sign.signTexthl}`);
        }
    });
}
exports.defineSigns = defineSigns;
function placeSigns(nvim, signs, file) {
    return __awaiter(this, void 0, void 0, function* () {
        yield unsetSigns(nvim, file);
        yield clearHighlight(nvim);
        const locList = [];
        yield Promise.all(signs.map((sign, idx) => __awaiter(this, void 0, void 0, function* () {
            sign['id'] = utils_1.guid();
            yield nvim.command(`sign place ${sign['id']} line=${sign.start.line}, name=TSerror file=${file}`);
            //list: Array<{ filename: string; lnum: number; col: number; text: string }>,
            locList.push({ filename: file, lnum: sign.start.line, col: sign.start.offset, text: sign.text });
            signStore.push(sign);
            yield highlightLine(nvim);
        })));
        yield utils_1.createLocList(nvim, locList, 'Errors', false);
    });
}
exports.placeSigns = placeSigns;
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
        return yield Promise.all(signStore.map((sign) => __awaiter(this, void 0, void 0, function* () {
            yield nvim.command(`sign unplace ${sign['id']} file=${file}`);
            signStore = signStore.filter(e => e['id'] !== sign['id']);
        })));
    });
}
function getSign(nvim, line, offset) {
    for (let i = 0; i < signStore.length; i++) {
        if (signStore[i].start.line === line &&
            signStore[i].start.offset <= offset &&
            signStore[i].end.offset > offset) {
            return signStore[i];
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
function highlightLine(nvim) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let sign of signStore) {
            yield nvim.buffer.addHighlight({
                srcId: sign['id'],
                hlGroup: 'NeomakeError',
                line: sign.start.line - 1,
                colStart: sign.start.offset - 1,
                colEnd: sign.end.offset - 1
            });
        }
    });
}
