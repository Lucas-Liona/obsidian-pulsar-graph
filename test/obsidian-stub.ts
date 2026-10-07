// Stand-ins for the runtime values the plugin imports from 'obsidian', which
// ships declarations only. Anything a test needs to behave like the real class
// is added here, deliberately and no further.
export class TFile {
    path = '';
    extension = 'md';
    stat = { mtime: 0, ctime: 0, size: 0 };
}

export class TAbstractFile {}

export class App {}
