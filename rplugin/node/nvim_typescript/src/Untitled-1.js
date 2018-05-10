var telemetry = {
  seq: 0,
  type: "event",
  event: "telemetry",
  body: {
    telemetryEventName: "projectInfo",
    payload: {
      projectId: "d2a20dab86e5359b7b3cd1dd0abd84dd",
      fileStats: [Object],
      compilerOptions: [Object],
      typeAcquisition: [Object],
      extends: false,
      files: false,
      include: false,
      exclude: false,
      compileOnSave: false,
      configFileName: "tsconfig.json",
      projectType: "configured",
      languageServiceEnabled: true,
      version: "2.7.1"
    }
  }
};
var configFileDiag = {
  seq: 0,
  type: "event",
  event: "configFileDiag",
  body: {
    triggerFile: "/Users/mhartington/testTs/main.ts",
    configFile: "/Users/mhartington/testTs/tsconfig.json",
    diagnostics: []
  }
};
var typingsInstallerPid = {
  seq: 0,
  type: "event",
  event: "typingsInstallerPid",
  body: { pid: 34709 }
};

var reload = {
  seq: 0,
  type: "response",
  command: "reload",
  request_seq: 1,
  success: true,
  body: { reloadFinished: true }
};
var quickinfoRes = {
  seq: 0,
  type: "response",
  command: "quickinfo",
  request_seq: 2,
  success: false,
  message: "No content available."
};

var rename = {
  info: {
    canRename: true,
    kind: "property",
    displayName: "hasSearch",
    fullDisplayName:
      '"/Users/mhartington/GitHub/StarTrack-ng/src/app/pages/search/search.page".SearchPage.hasSearch',
    kindModifiers: "",
    triggerSpan: { start: 942, length: 9 }
  },
  locs: [
    {
      file:
        "/Users/mhartington/GitHub/StarTrack-ng/src/app/pages/search/search.page.ts",
      locs: [Array]
    }
  ]
};
var newImport = [
  {
    fileName:
      "/Users/mhartington/GitHub/StarTrack-ng/src/app/pages/search/search.page.ts",
    textChanges: [
      {
        start: { line: 13, offset: 1 },
        end: { line: 13, offset: 1 },
        newText: "import { FormControl } from '@angular/forms';\n"
      }
    ]
  }
];

var appendImport =
  fixes[
    {
      fileName:
        "/Users/mhartington/GitHub/StarTrack-ng/src/app/pages/search/search.page.ts",
      textChanges: [
        {
          start: { line: 5, offset: 21 },
          end: { line: 5, offset: 21 },
          newText: ", FormControl"
        }
      ]
    }
  ];

var appendLeadingComma = [
  {
    fileName:
      "/Users/mhartington/GitHub/StarTrack-ng/src/app/pages/search/search.page.ts",
    textChanges: [
      {
        start: { line: 5, offset: 21 },
        end: { line: 5, offset: 21 },
        newText: ", FormControl"
      }
    ]
  }
];

var workspace = {
  name: "documentElement",
  kind: "property",
  file: "/Users/mhartington/n/lib/node_modules/typescript/lib/lib.dom.d.ts",
  start: { line: 2694, offset: 5 },
  end: { line: 2694, offset: 34 },
  kindModifiers: "declare",
  matchKind: "prefix",
  containerName: "Document",
  containerKind: "interface"
};
