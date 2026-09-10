# Contributing

Small, focused pull requests are welcome. For changes to scan semantics or deletion behavior, open an issue describing the intended behavior first.

## Local workflow

1. Use macOS with Node.js 22+ and Xcode Command Line Tools.
2. Run `npm ci` and `npm run setup`.
3. Run `npm run dev` to work on the interface.
4. Run `npm test`, `npm run check`, and `npm run build` before submitting.

Cover file identity, symbolic links, hardlinks, overlapping selections, and access errors when changing the scanner or cleanup path. Do not replace native Trash with permanent deletion.

Use generated temporary fixtures. Never commit real scan results, personal paths, private documents, tokens, or screenshots of an actual home directory. Reproduce issues with synthetic data.

Describe the problem, resulting behavior, and verification in the pull request. Include screenshots for visible changes, labelled as synthetic when applicable.
